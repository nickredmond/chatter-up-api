const express = require('express');
const bodyParser = require('body-parser');
const mongodb = require('mongodb');
var crypto = require('crypto');
const uuid = require('uuid/v1'); // v1 is timestamp-based
const jwt = require('jsonwebtoken');
const url = require('url');
const request = require('request-json');
const Pusher = require('pusher');

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const PUSHER_APP_ID = process.env.PUSHER_APP_ID;
const PUSHER_KEY = process.env.PUSHER_KEY;
const PUSHER_SECRET = process.env.PUSHER_SECRET;
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER;
const NEXMO_API_KEY = process.env.NEXMO_API_KEY;
const NEXMO_SECRET = process.env.NEXMO_SECRET;  
const NEXMO_SMS_NUMBER = process.env.NEXMO_SMS_NUMBER;
const NEXMO_EVENT_URL = process.env.NEXMO_EVENT_URL;

Date.prototype.addHours = function(h) {    
    this.setTime(this.getTime() + (h*60*60*1000)); 
    return this;   
}
Date.prototype.addMinutes = function(m) {    
    this.setTime(this.getTime() + (m*60*1000)); 
    return this;   
}

const MongoClient = mongodb.MongoClient;
const databaseUrl = process.env.DATABASE_URI || 'mongodb://localhost:27017';
const databaseName = process.env.DATABASE_NAME || 'localSandbox'; 
let cachedDb = null;

const allowAnyOrigin = function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
};

// used for debugging/dev, not prod
const logRequest = function(req, res, next) {
    console.log('request ', req);
    next();
}

const handleError = (message, err, res) => {
    console.log(message, err)
    res.status(500).send({ error: message });
}

const getDb = function(res, onConnect) {
    try {
        if (cachedDb) {
            onConnect(cachedDb);
        }
        else {
            MongoClient.connect(databaseUrl, {useNewUrlParser: true}, (err, client) => {
                if (err) {
                    if (res) {
                        handleError('Error connecting to database.', err, res);
                    }
                    else {
                        console.log('no response obj for DB connection err: ', err);
                    }
                }
                else {
                    cachedDb = client.db(databaseName);
                    // so you may efficiently sort by the field
                    cachedDb.collection('chatConnections').createIndex({ lastConnected: -1 });
                    cachedDb.collection('users').createIndex({ lastOnline: -1 });
                    cachedDb.collection('users').createIndex({ username: 1 });
                    cachedDb.collection('phoneCalls').createIndex({ virtualNumber: 1 });
                    onConnect(cachedDb);
                }
            });
        }
    }
    catch (error) {
        console.log('ERROR connecting to Mongo ', error.name, error.message, error.stack);
        res.status(500).send('Error connecting to database.');
    }
}

var app = express();
app.use(bodyParser.json());
app.use(allowAnyOrigin);

const port = process.env.PORT || 8080;
let pusher = null;
app.listen(port, () => {
    console.log("INFO: app started on port " + port);

    pusher = new Pusher({
        appId: PUSHER_APP_ID,
        key: PUSHER_KEY,
        secret: PUSHER_SECRET,
        cluster: PUSHER_CLUSTER
    });
    beginListenVirtualNumbersQueue();
});

const generateHash = (plainTextPassword, salt) => {
    return crypto.pbkdf2Sync(plainTextPassword, salt, 10000, 512, 'sha512').toString('hex');
}

// return { salt, hash }
const generateSecurePassword = (plainTextPassword) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = generateHash(plainTextPassword, salt);
    return { salt, hash };
}

const isPasswordValid = (plainTextPassword, userSalt, userHash) => {
    const hash = generateHash(plainTextPassword, userSalt);
    return hash === userHash;
}

const generateJwt = (username) => {
    const expirationDate = new Date();
    expirationDate.addHours(1);

    return jwt.sign({
      username,
        exp: expirationDate.getTime()
    }, JWT_SECRET);
}

app.post("/create-user", (req, res, next) => {
    getDb(res, (db) => {
        const username = req.body.username ? req.body.username.toLowerCase() : null;
        const password = req.body.password;
        if (username && password) {
            db.collection('users').findOne({ username }, (err, existingPlayer) => {
                if (err) {
                    handleError('Error checking if player name ' + username + ' exists.', err, res);
                }
                else if (existingPlayer) {
                    res.status(400).send({ playerAlreadyExists: true });
                }
                else {
                    db.collection('users').findOne({ email: { $eq: req.body.email } }, (err, existingPlayer) => {
                        if (err) {
                            handleError('Error checking if username ' + username + ' exists.', err, res);
                        }
                        else if (existingPlayer) {
                            res.status(400).send({ isEmailTaken: true });
                        }
                        else {
                            const securePassword = generateSecurePassword(password);
                            const socketReceiveId = uuid();
                            const user = {
                                username,
                                email: req.body.email,
                                hash: securePassword.hash,
                                salt: securePassword.salt,
                                socketReceiveId, 
                                lastOnline: new Date(),
                                phoneCallsEnabled: false,
                                aboutMe: '',
                                coolPoints: 0,
                                badges: [],
                                messageLists: [],
                                blockedUsernames: []
                            };
                            db.collection('users').insertOne(user, (err) => {
                                if (err) {
                                    handleError('Error creating new user.', err, res);
                                }
                                else {
                                    const token = generateJwt(username);
                                    const responseBody = { token, socketReceiveId };
                                    res.status(200).send(responseBody);
                                }
                            });
                        }
                    });
                }
            });
        }
        else {
            res.status(400).send({ errorMessage: 'Username and password are required.' });
        }
    });
});

const isUserPhoneConfirmed = async (username, db) => {
    try {
        const userInfo = await db.collection('users').findOne(
            { username },
            { isPhoneNumberConfirmed: 1, phoneNumber: 1 }
        );
        return {
            isPhoneNumberConfirmed: userInfo.isPhoneNumberConfirmed,
            phoneNumberExists: userInfo.phoneNumber && userInfo.phoneNumber.length > 0
        };
    } catch (err) {
        console.log('ERROR /autenticate (validating phone number): ', err);
        throw err;
    }
}

// maybe use auth lambda gateway or something in future
app.post("/authenticate", (req, res, next) => {
    // use in socket when joining games
    // todo: pass from both app and ws server to refresh exp of token (keep user logged in)
    authenticatedDb(req, res, (username, db) => {
        isUserPhoneConfirmed(username, db).then(
            result => {
                const refreshedToken = generateJwt(username);
                res.status(200).send({ 
                    isAuthenticated: true, 
                    isPhoneNumberConfirmed: result.isPhoneNumberConfirmed,
                    phoneNumberExists: result.phoneNumberExists,
                    refreshedToken 
                });
            },
            _ => {
                res.status(500).send();
            }
        )
    });
});

app.post("/log-in", (req, res, next) => {
    const username = req.body.username ? req.body.username.toLowerCase() : null;
    const password = req.body.password;

    if (username && password) {
        getDb(res, (db) => {
            db.collection('users').findOne({ username: { $eq: username } }, (err, user) => {
                if (err) {
                    handleError('Error occurred while logging in.', err, res);
                }
                else if (!user) {
                    res.status(400).send({ playerExists: false, error: 'Could not find player with that username.' });
                }
                else if (!isPasswordValid(password, user.salt, user.hash)) {
                    res.status(400).send({ playerExists: true, error: 'Password is invalid.' });
                }
                else {
                    setUserConnected(user.username, db).then(
                        _ => {
                            const token = generateJwt(user.username);
                            const phoneNumberExists = user.phoneNumber && user.phoneNumber.length > 0;
                            const phoneNumberVerified = user.isPhoneNumberConfirmed;
                            res.status(200).send({ 
                                token,
                                phoneNumberExists,
                                phoneNumberVerified,
                                socketReceiveId: user.socketReceiveId
                            });
                        },  
                        err => {
                            console.log('ERROR setting user lastOnline during /log-in', err);
                            res.status(500).send();
                        }
                    );
                }
            });
        });
    }
    else {
        res.status(400).send({ errorMessage: 'Username and password are required.' });
    }
});

const isTokenExpired = (expiry) => {
    const currentTime = new Date().getTime();
    return expiry <= currentTime;
}

// return username if successful
const verifyToken = (token, res, onSuccess) => {
    jwt.verify(token, JWT_SECRET, (err, decodedToken) => {
        if (err || !decodedToken || !decodedToken.username) {
            res.status(401).send({ error: 'User token is invalid!' });
        }
        else if (isTokenExpired(decodedToken.exp)) {
            res.status(401).send({ isTokenExpired: true, error: 'User token has expired!' });
        }
        else {
            onSuccess(decodedToken.username);
        }
    });
}

const setUserConnected = async (username, db) => {
    await db.collection('users').updateOne(
        { username },
        { $set: { lastOnline: new Date() } }
    );
}

const authenticatedDb = (req, res, onSuccess) => {
    verifyToken(req.body.token, res, username => {
        getDb(res, db => {
            setUserConnected(username, db).catch(err => {
                console.log('ERROR updating user "' + username + '" last connected status: ', err);
            });
            onSuccess(username, db);
        });
    })
}

const returnError = (res, errorMessage, statusCode) => {
    const status = statusCode || 500;
    console.log('ERROR (status=' + status + '): ' + errorMessage);
    res.status(status).send({ errorMessage });
};

app.post('/chat/connect', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        const otherUsername = req.body.username;
        
        db.collection('chatConnections').findOne({
            $and: [
                { usernames: username },
                { usernames: otherUsername }
            ]
        }, (err, connection) => {
            if (err) {
                returnError(res, 'Error finding channel with usernames ' + username + ' and ' + otherUsername);
            }
            else if (connection) {
                res.status(200).send({ channelId: connection.channelId });
            }
            else {
                const channelId = uuid();
                const connection = {
                    channelId,
                    usernames: [username, otherUsername],
                    lastConnected: new Date()
                };
                const conversation = {
                    channelId,
                    lastMessageDate: null,
                    lastMessagePreview: null,
                    messages: []
                };
                
                db.collection('chatConnections').insertOne(connection, err => {
                    if (err) {
                        const errorMessage = 'Error inserting connection for users ' + username + ' and ' + otherUsername + ' with channelId ' + channelId + ', msg=' + err;
                        returnError(res, errorMessage);
                    }
                    else {
                        db.collection('conversations').insertOne(conversation, err => {
                            if (err) {
                                const errorMessage = 'Error inserting connection for users ' + username + ' and ' + otherUsername + ' with channelId ' + channelId + ', msg=' + err;
                                returnError(res, errorMessage);
                            }
                            else {
                                res.status(200).send({ channelId });
                            }
                        })
                    }
                });
            }
        });
    });
});

app.post('/chat/messages', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        const channelId = req.body.channelId;

        db.collection('chatConnections').updateOne(
            { channelId },
            { $set: { lastConnected: new Date() } }
        );
        db.collection('conversations').findOne({ channelId }, (err, conversation) => {
            if (err || !conversation) {
                const errorMessage = 'Error fetching conversation with channelId ' + channelId;
                returnError(res, errorMessage);
            }
            else {
                res.status(200).send(conversation.messages);
            }
        });
    });
});

const allowedToContactUser = async (username, otherUsername, db) => {
    try {
        const users = await db.collection('users').find({
            username: { $in: [username, otherUsername] }
        }).toArray();
        
        return users.filter(user => {
            return (user.username === username && user.blockedUsernames.includes(otherUsername)) ||
            (user.username === otherUsername && user.blockedUsernames.includes(username));
        }).length === 0;
    } catch(err) {
        console.log('ERROR /chat/message -- allowedToContactUser(): ', err);
    }
}

const sendMessage = async (username, channelId, content, db) => {
    try {
        const message = {
            sentBy: username,
            dateSent: new Date(),
            content
        };
        await db.collection('conversations').updateOne(
            { channelId },
            { 
                $push: { messages: message },
                $set: {
                    lastMessageDate: new Date(), 
                    lastMessagePreview: message.content.substring(0, 30) 
                } 
            }
        );
        await db.collection('chatConnections').updateOne(
            { channelId },
            { $set: { lastConnected: new Date() } }
        );

        pusher.trigger(channelId, 'message', message);
    } catch(err) {
        console.log('ERROR /chat/message -- sendMessage(): ', err);
        throw err;
    }
}

app.post('/chat/message', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        const channelId = req.body.channelId;
        db.collection('chatConnections').findOne({ channelId }, (err, connection) => {
            if (err || !connection) {
                const errorMessage = 'Error fetching chatConnection with channelId ' + channelId;
                returnError(res, errorMessage);
            }
            else if (!connection.usernames.includes(username)) {
                const errorMessage = 'User ' + username + ' is not authorized to participate in chat with channelId ' + channelId;
                returnError(res, errorMessage, 403);
            }
            else {
                const otherUsername = connection.usernames.filter(name => name !== username)[0];
                allowedToContactUser(username, otherUsername, db).then(
                    allowed => {
                        if (allowed) {
                            sendMessage(username, channelId, req.body.content, db).then(
                                _ => {
                                    res.status(204).send();
                                },
                                _ => {
                                    res.status(500).send();
                                }
                            )
                        }
                        else {
                            res.status(403).send({ errorMessage: 'You are not allowed to contact this user.' });
                        }
                    },
                    _ => {
                        res.status(500).send();
                    }
                );
            }
        });
    });
});

const isUserOnline = (lastOnline) => {
    const fiveMinAgo = new Date();
    fiveMinAgo.addMinutes(-5);
    return lastOnline >= fiveMinAgo;
}

const getMessagesList = async (username, db) => {
    try {
        const connections = await db.collection('chatConnections').find({
            usernames: username
        }).toArray();

        let conversations = [];
        let unblockedConversations = [];
        if (connections && connections.length > 0) {
            const channelIds = [];
            const usernames = [username];
            const usernamesByChannel = {};
            connections.forEach(connection => {
                channelIds.push(connection.channelId);
                const otherUsername = connection.usernames.filter(name => name !== username)[0];
                usernames.push(otherUsername);
                usernamesByChannel[connection.channelId] = otherUsername;
            });

            conversations = await db.collection('conversations')
                .find({ 
                    channelId: { $in: channelIds },  
                    lastMessagePreview: { $exists: true }
                })
                .project({ channelId: 1, lastMessageDate: 1, lastMessagePreview: 1 })
                .toArray();
            const users = await db.collection('users')
                .find({ username: { $in: usernames } })
                .project({ username: 1, lastOnline: 1, blockedUsernames: 1 })
                .toArray();
            const user = users.filter(user => user.username === username)[0];
            
            conversations.forEach(conversation => {
                const otherUsername = usernamesByChannel[conversation.channelId];
                const otherUser = users.filter(user => user.username === otherUsername)[0];
                
                if (!user.blockedUsernames.includes(otherUsername) && !otherUser.blockedUsernames.includes(username)) {
                    const lastOnline = otherUser.lastOnline;
                    conversation.username = otherUsername;
                    conversation.isOnline = isUserOnline(lastOnline);
                    unblockedConversations.push(conversation);
                }
            });
        }

        return unblockedConversations;
    } catch(err) {
        console.log('ERROR /messages/list: ', err);
        throw err;
    }
}

app.post('/messages/list', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        getMessagesList(username, db).then(
            messagesList => {
                res.status(200).send(messagesList);
            },
            _ => {
                res.status(500).send();
            }
        );
    })
});

const getUsers = async (username, db) => {
    try {
        const me = (await db.collection('users')
            .find({ username })
            .project({ blockedUsernames: 1 })
            .toArray())[0];
        const blockedUsernames = me.blockedUsernames;

        const callableUsers = await db.collection('users')
            .find({
                $and: [
                    { isPhoneNumberConfirmed: true },
                    { phoneCallsEnabled: true },
                    { username: { $ne: username }}
                ]
            })
            .limit(10)
            .toArray();

        const connections = await db.collection('chatConnections')
            .find({ usernames: username })
            .sort({ lastConnected: -1 })
            .limit(10)
            .toArray();
        const recentUsernames = connections.map(connection => {
            const otherUsername = connection.usernames.filter(name => {
                return name !== username;
            })[0];
            return otherUsername;
        });
        const recentlyConnectedUsers = await db.collection('users')
            .find({ username: { $in: recentUsernames } })
            .toArray();

        const recentlyOnlineUsers = await db.collection('users')
            .find({ username: { $ne: username } })
            .sort({ lastOnline: -1 })
            .limit(10)
            .toArray();
        
        let usersData = recentlyOnlineUsers.concat(callableUsers);
        usersData = usersData.concat(recentlyConnectedUsers);
        const distinctUsers = [];
        const distinctUsernames = [];
        for (var i = 0; i < usersData.length; i++) {
            const userData = usersData[i];
            if (!distinctUsernames.includes(userData.username) && 
                !blockedUsernames.includes(userData.username) && 
                !userData.blockedUsernames.includes(username)) {

                distinctUsernames.push(userData.username);
                const user = {
                    isOnline: isUserOnline(userData.lastOnline),
                    canBeCalled: userData.isPhoneNumberConfirmed && userData.phoneCallsEnabled,
                    username: userData.username,
                    coolPoints: userData.coolPoints,
                    badges: userData.badges.length
                };
                distinctUsers.push(user);
            }
        }
        
        return distinctUsers;
    } catch(err) {
        console.log('ERROR /users: ', err);
        throw err;
    }
}

app.post('/users', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        getUsers(username, db).then(
            users => {
                res.status(200).send(users);
            },
            _ => {
                res.status(500).send();
            }
        );
    })
});

const getUser = async (username, db) => {
    try {
        const user = await db.collection('users').findOne(
            { username },
            {
                username: 1,
                lastOnline: 1,
                phoneCallsEnabled: 1,
                isPhoneNumberConfirmed: 1,
                aboutMe: 1,
                coolPoints: 1,
                badges: 1
            }
        );
        const isOnline = isUserOnline(user.lastOnline);

        return {
            username: user.username,
            about: user.aboutMe,
            coolPoints: user.coolPoints,
            badges: user.badges,
            lastOnline: isOnline ? null : user.lastOnline,
            isOnline,
            canBeCalled: user.isPhoneNumberConfirmed && user.phoneCallsEnabled
        };
    } catch (err) {
        console.log('ERROR /user: ', err);
        throw err;
    }
}

app.post('/user', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        const requestedUser = req.body.username;
        if (requestedUser) {
            getUser(requestedUser, db).then(
                user => {
                    res.status(200).send(user);
                },
                _ => {
                    res.status(500).send();
                }
            );
        }
        else {
            res.status(400).send({ errorMessage: 'Username is required.' });
        }
    });
});

const sendVerificationCode = async (username, phoneNumber, db) => {
    const verificationNumber = Math.round(Math.random() * 99000 + 10000);
    await db.collection('users').updateOne(
        { username },
        { 
            $set: { 
                phoneNumber, 
                verificationNumber,
                isPhoneNumberConfirmed: false 
            } 
        }
    );

    const verificationMessage = 'Your confirmation code for TalkItOut is ' + verificationNumber + '.';
    request.createClient('https://rest.nexmo.com').post('sms/json', {
        api_key: NEXMO_API_KEY,
        api_secret: NEXMO_SECRET,
        from: NEXMO_SMS_NUMBER,
        to: phoneNumber,
        text: verificationMessage
    }, (err, res, body) => {
        console.log('/user/phone VERIFICATION (Nexmo SMS msg) status: ' + res.statusCode, err);
    });
}

const PhoneVerification = {
    INVALID_NUMBER: 'invalidNumber',
    NUMBER_IN_USE: 'numberInUse',
    VERIFICATION_SENT: 'verificationSent'
};
const verifyPhonenumber = async (username, phoneNumber, db) => {
    let result = false;
    
    try {
        isValidNumber = phoneNumber && phoneNumber.length >= 5; // for int'l support
        if (isValidNumber) {
            const existingUser = await db.collection('users').findOne(
                { phoneNumber },
                { verificationNumber: 1 }
            );
            if (existingUser && existingUser.verificationNumber) {
                result = PhoneVerification.NUMBER_IN_USE;
            }
            else {
                await sendVerificationCode(username, phoneNumber, db);
                result = PhoneVerification.VERIFICATION_SENT;
            }
        }
        else {
            result = PhoneVerification.INVALID_NUMBER;
        }

        return result;
    } catch (err) {
        console.log('ERROR: /user/phone ', err);
        throw err;
    }
}

app.post('/user/phone', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        verifyPhonenumber(username, req.body.phoneNumber, db).then(
            result => {
                if (result === PhoneVerification.VERIFICATION_SENT) {
                    res.status(204).send();
                }
                else if (result === PhoneVerification.INVALID_NUMBER) {
                    res.status(422).send({errorMessage: 'Phone number is invalid.' });
                }
                else if (result === PhoneVerification.NUMBER_IN_USE) {
                    res.status(400).send({errorMessage: 'Phone number already in use.' });
                }
                else {
                    console.log('ERROR /user/phone: Nick, your logic is broken ;)');
                    res.status(500).send();
                }
            },
            _ => {
                res.status(500).send();
            }
        );
    });
});

const activatePhoneNumber = async (username, verificationNumber, db) => {
    try {
        const userInfo = await db.collection('users')
            .findOne({ username }, { verificationNumber: 1 });
        const isMatching = verificationNumber.toString() === userInfo.verificationNumber.toString();

        if (isMatching) {
            db.collection('users').updateOne(
                { username },
                { $set: { isPhoneNumberConfirmed: true } }
            );
        }
        return isMatching;
    } catch (err) {
        console.log('ERROR /user/phone/verify: ', err);
        throw err;
    }
}

app.post('/user/phone/verify', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        activatePhoneNumber(username, req.body.verificationNumber, db).then(
            isActivated => {
                if (isActivated) {
                    res.status(204).send();
                }
                else {
                    res.status(400).send({errorMessage: 'Verification number doesn\'t match our records.'});
                }
            },
            _ => {
                res.status(500).send();
            }
        );
    });
});

const updateAboutMe = async (username, aboutMe, db) => {
    try {
        await db.collection('users').updateOne(
            { username },
            { $set: { aboutMe } }
        );
    } catch (err) {
        console.log('ERROR /profile/about (username "' + username + '"): ', err);
    }
}

app.post('/profile/about', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        if (req.body.aboutMe) {
            updateAboutMe(username, req.body.aboutMe, db).then(
                _ => {
                    res.status(204).send();
                },
                _ => {
                    res.status(500).send();
                }
            )
        }
        else {
            res.status(400).send({ errorMessage: 'About me text is required.' });
        }
    });
});

const setCallsEnabled = async (username, db, enabled) => {
    try {
        await db.collection('users').updateOne(
            { username },
            { $set: { phoneCallsEnabled: enabled } }
        );
    } catch(err) {
        console.log('ERROR /profile/calls/[' + enabled + ']: ', err);
        throw err;
    }
};

app.post('/profile/calls/enable', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        setCallsEnabled(username, db, true).then(
            _ => {
                res.status(204).send();
            },
            _ => {
                res.status(500).send();
            }
        )
    });
});

app.post('/profile/calls/disable', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        setCallsEnabled(username, db, false).then(
            _ => {
                res.status(204).send();
            },
            _ => {
                res.status(500).send();
            }
        )
    });
});

/** BEGIN: VIRTUAL NUMBERS QUEUE */

const VIRTUAL_NUMBERS_QUEUE = [];
let CURRENT_VIRTUAL_NUMBER_REQUEST = null;
const beginListenVirtualNumbersQueue = () => {
    console.log('>>> beginning listen to virtual numbers queue...');
    setInterval(() => {
        // this is spam
        // console.log('>>> virtual# Q: busy=' + !!CURRENT_VIRTUAL_NUMBER_REQUEST + ', qSize=' + VIRTUAL_NUMBERS_QUEUE.length);
        if (!CURRENT_VIRTUAL_NUMBER_REQUEST && VIRTUAL_NUMBERS_QUEUE.length) {
            console.log('>>> gettingVirtual#...');
            CURRENT_VIRTUAL_NUMBER_REQUEST = VIRTUAL_NUMBERS_QUEUE.splice(0, 1)[0];
            const callback = CURRENT_VIRTUAL_NUMBER_REQUEST.callback;
            const db = CURRENT_VIRTUAL_NUMBER_REQUEST.db;
            getVirtualNumber(db).then(
                virtualNumber => {
                    console.log('>>> virtual# retrieved: ' + virtualNumber);
                    callback(virtualNumber);
                    CURRENT_VIRTUAL_NUMBER_REQUEST = null;
                },
                err => {
                    console.log('>>> CRITICAL ERROR: could not retrieve virtual number -- ', err);
                    CURRENT_VIRTUAL_NUMBER_REQUEST = null;
                }
            )
        }
    }, 500);
}

const getVirtualNumber = async (db) => {
    try {
        const virtualNumbers = await db.collection('virtualNumbers')
            .find({ available: true })
            .toArray();
        if (virtualNumbers.length) {
            const availableNumber = virtualNumbers[0].phoneNumber;
            await db.collection('virtualNumbers').updateOne(
                { phoneNumber: availableNumber },
                { $set: { available: false } }
            );
            return availableNumber;
        }
        else {
            console.log('>>> CRITICAL: Nick didnt implement logic to rent new numbers!');
            // todo: rent number, add to database, return
        }
    } catch(err) {
        console.log('ERROR getting available virtual number (or renting one): ', err);
        throw err;
    }
}

const requestVirtualNumber = (db) => {
    return new Promise((resolve, reject) => {
        let isNumberRetrieved = false;
        VIRTUAL_NUMBERS_QUEUE.push({
            db,
            callback: (virtualNumber) => {
                console.log('>>> virtual# resolved: ' + virtualNumber);
                isNumberRetrieved = true;
                resolve(virtualNumber);
            }
        });
        setTimeout(() => {
            if (!isNumberRetrieved) {
                console.log('>>> CRITICAL ERROR: virtual number was not found in 30 seconds!!');
                reject(false);
            }
        }, 30000);
    });
}

/** END: VIRTUAL NUMBERS QUEUE */

const isUserAvailable = async (username, db) => {
    try {
        const phoneCalls = await db.collection('phoneCalls')
            .find({
                $or: [
                    { 'from.username': username },
                    { 'to.username': username }
                ]
            })
            .project({ isActive: 1 })
            .toArray();
        const isAvailable = !(phoneCalls && phoneCalls.length > 0 && phoneCalls[0].isActive);
        return isAvailable;
    } catch(err) {
        console.log('ERROR /call/initialize (isUserAvailable): ', err);
        throw err;
    }
}

const initializeCall = async (fromUsername, toUsername, db, userBlocked) => {
    try {
        const userInfos = await db.collection('users')
            .find({ username: { $in: [fromUsername, toUsername] } })
            .project({ 
                username: 1, 
                phoneNumber: 1, 
                socketReceiveId: 1,
                blockedUsernames: 1
            })
            .toArray();
        const fromUser = userInfos.filter(user => user.username === fromUsername)[0];
        const toUser = userInfos.filter(user => user.username === toUsername)[0];
        
        if (fromUser.blockedUsernames.includes(toUser.username) ||
            toUser.blockedUsernames.includes(fromUser.username)) {

            userBlocked();
        }
        else {
            const virtualNumber = await requestVirtualNumber(db);

            await db.collection('phoneCalls').insertOne({
                from: {
                    username: fromUsername,
                    phoneNumber: fromUser.phoneNumber
                },
                to: {
                    username: toUsername,
                    phoneNumber: toUser.phoneNumber
                },
                virtualNumber,
                isActive: false,
                ratings: []
            });

            pusher.trigger(toUser.socketReceiveId, 'incoming-call', {
                phoneNumber: virtualNumber,
                username: fromUsername
            });

            return virtualNumber;
        }
    } catch(err) {
        console.log('ERROR /call/initialize (initializeCall): ', err);
        throw err;
    }
}

app.post('/call/initialize', (req, res, next) => {
    if (!req.body.username) {
        res.status(400).send({errorMessage: 'Username is required.'});
    }
    else {
        const toUser = req.body.username;
        authenticatedDb(req, res, (username, db) => {
            isUserAvailable(toUser, db).then(
                available => {
                    if (available) {
                        userBlocked = () => {
                            res.status(403).send({ errorMessage: 'You are not allowed to call this user.' });
                        };
                        initializeCall(username, toUser, db, userBlocked).then(
                            virtualNumber => {
                                res.status(200).send({ virtualNumber });
                            },
                            _ => {
                                res.status(500).send();
                            }
                        );
                    }
                    else {
                        res.status(400).send({errorMessage: 'User is not available at this time.'});
                    }
                },
                _ => {
                    res.status(500).send();
                }
            )
        });
    }    
});

/**
 * NEXMO CALL WEBHOOK ENDPOINTS
 */

 const getNexmoCallControlObject = async (virtualNumber, fromNumber, db) => {
     try {
        const phoneCall = await db.collection('phoneCalls').findOne({
            virtualNumber,
            isActive: false,
            dateEnded: null,
            'from.phoneNumber': fromNumber
        });
        if (!phoneCall) {
            console.log('cant find non-active call for virtual number ' + virtualNumber);
            throw new Error('call not available to be received.');
        }
        await db.collection('phoneCalls').updateOne(
            { _id: phoneCall._id },
            { $set: { 
                isActive: true,
                dateStarted: new Date()
            } }
        );

        const fromUser = await db.collection('users').findOne(
            { username: phoneCall.from.username },
            { socketReceiveId: 1 }
        );
        pusher.trigger(fromUser.socketReceiveId, 'call-begin', {
            callId: phoneCall._id.toString()
        });

        const targetNumber = phoneCall.to.phoneNumber;
        const ncco = [
            {
                action: 'connect',
                eventUrl: [NEXMO_EVENT_URL],
                timeout: 45,
                from: virtualNumber, // virtual number being called
                endpoint: [
                    {
                        type: 'phone',
                        number: targetNumber
                    }
                ]
            }
        ];
        return ncco;
     } catch(err) {
         console.log('>>> CRITICAL ERROR - virtual number ' + virtualNumber + ' not found or not available, or other error: ', err);
         throw err;
     }
 }

 app.get('/proxy-call', (req, res, next) => {
    console.log('NEXMO PROXY-CALL (/proxy-call): ', req.query);
    getDb(res, db => {
        const virtualNumber = req.query.to;
        const fromNumber = req.query.from;
        getNexmoCallControlObject(virtualNumber, fromNumber, db).then(
            ncco => {
                res.json(ncco);
            },
            _ => {
                res.status(500).send();
            }
        );
    });
 });

const endCall = async (virtualNumber, db) => {
    try {  
        const phoneCall = await db.collection('phoneCalls').findOne(
            { 
                virtualNumber, 
                isActive: true
            },
            { from: 1 }
        );
        if (phoneCall) {
            await db.collection('phoneCalls').updateOne(
                { _id: phoneCall._id },
                { $set: {
                    isActive: false,
                    dateEnded: new Date()
                } }
            );
            await db.collection('virtualNumbers').updateOne(
                { phoneNumber: virtualNumber },
                { $set: { available: true } }
            );
        }
    } catch(err) {
        console.log('ERROR ending call (NEXMO /event): ', err);
    }
}

 app.post('/event', (req, res, next) => {
    console.log('NEXMO CALL EVENT (/event): ', req.body);
    if (req.body && req.body.status === 'completed') {
         // todo: maybe check and only update DB/call if not already completed
        getDb(res, db => {
            const virtualNumber = req.body.to;
            endCall(virtualNumber, db).then(
                _ => {
                    console.log('call ended, virtual# ' + virtualNumber);
                    res.status(204).end();
                },
                _ => {
                    res.status(204).end();
                }
            )
        })
    }
    else {
        res.status(204).end();
    }
 })

 /** END NEXMO WEBHOOKS */

const getRandomQuote = async (db) => {
    try {
        const results = await db.collection('quotes').aggregate([
            { $sample: { size: 1 } }
        ]).toArray();
        return results[0];
    } catch(err) {
        console.log('ERROR /quote: ', err);
        throw err;
    }
}

app.post('/quote', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        getRandomQuote(db).then(
            quote => {
                res.status(200).send(quote);
            },
            _ => {
                res.status(500).send();
            }
        );
    });
});

/** BEGIN: SUPPORT ENDPOINTS */

const isValidReport = (req) => {
    return req.body && req.body.username && req.body.category && req.body.description;
}

reportUser = async (username, requestBody, db) => {
    try {  
        const report = {
            submittedBy: username,
            usernameReported: requestBody.username, 
            category: requestBody.category,
            description: requestBody.description
        };
        await db.collection('reports').insertOne(report);
    } catch(err) {
        console.log('ERROR /report: ', err);
        throw err;
    }
}

app.post('/report', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        if (isValidReport(req)) {
            reportUser(username, req.body, db).then(
                _ => {
                    res.status(204).send();
                },
                _ => {
                    res.status(500).send();
                }
            )
        }
        else {
            res.status(400).send({ errorMessage: 'Invalid report.' });
        }
    })
});

const usernameExists = async (username, db) => {
    try {   
        const user = await db.collection('users').findOne({ username });
        return !!user;
    } catch(err) {
        console.log('ERROR /username/exists: ', err);
        throw err;
    }
}

app.post('/username/exists', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        if (req.body && req.body.username) {
            const requestedUsername = req.body.username.toLowerCase();
            usernameExists(requestedUsername, db).then(
                exists => {
                    res.status(200).send({ exists });
                },
                _ => {
                    res.status(500).send();
                }
            );
        }   
        else {
            res.status(400).send({ errorMessage: 'Username is required.' });
        }
    });
});

const blockUser = async (username, blockedUsername, db) => {
    try {
        await db.collection('users').updateOne(
            { username },
            { $push: { blockedUsernames: blockedUsername } }
        );
    } catch(err) {
        console.log('ERROR /username/block: ', err);
        throw err;
    }
}

app.post('/username/block', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        if (req.body && req.body.username) {
            const blockedUsername = req.body.username.toLowerCase();
            blockUser(username, blockedUsername, db).then(
                _ => {
                    res.status(204).send();
                },
                _ => {
                    res.status(500).send();
                }
            )
        }
        else {
            res.status(400).send({ errorMessage: 'Username is required.' });
        }
    });
})

/** END: SUPPORT ENDPOINTS */

const COOLPOINTS_BY_RATING = {
    'ok': 0,
    'good': 1,
    'great': 5
};
const saveCallRating = async (username, req, res, db) => {
    try {
        const ratingText = req.body.rating; 
        if (ratingText) {
            const callId = new mongodb.ObjectId(req.params.callId);
            const phoneCall = await db.collection('phoneCalls').findOne({ _id: callId });
            const callParticipants = [phoneCall.from.username, phoneCall.to.username];
            const hasRated = phoneCall.ratings.filter(rating => rating.usernameRated !== username).length > 0;

            if (hasRated) {
                res.status(400).send({ errorMessage: 'You have already rated this call.' });
            }
            else if (callParticipants.includes(username)) {
                const usernameRated = (username === phoneCall.from.username) ? phoneCall.to.username : phoneCall.from.username;
                const rating = {
                    usernameRated,
                    value: ratingText
                };
                await db.collection('phoneCalls').updateOne(
                    { _id: callId },
                    { $push: { ratings: rating } }
                );

                const coolPointsEarned = COOLPOINTS_BY_RATING[ratingText] || 0;
                if (coolPointsEarned > 0) {
                    await db.collection('users').updateOne(
                        { username: usernameRated },
                        { $inc: { coolPoints: coolPointsEarned } }
                    );
                }

                res.status(204).send();
            }
            else {
                res.status(403).send({ errorMessage: 'You are not permitted to rate this call.' });
            }
        }
        else {
            res.status(400).send({ errorMessage: 'Rating is required.'});
        }
    } catch(err) {
        console.log('ERROR /call/:callId/rate ', err);
        throw err;
    }
}

app.post('/call/:callId/rate', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        saveCallRating(username, req, res, db).catch(
            _ => {
                res.status(500).send();
            }
        );
        // check participants of call w/ ID
        //  if not caller then return 403 'cannot rate this call'
        // check isRated flag of call w/ given ID
        //  if true then return 400 'call is already rated'
        // else, 
        //  add coolPoints to phoneCall.to if >ok
        //  BADGES (todo): increment numberOfRatings of caller, this can go toward badge, award badge if earned

    });
});