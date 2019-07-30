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
        const username = req.body.username;
        const password = req.body.password;
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
                        const user = {
                            username,
                            email: req.body.email,
                            hash: securePassword.hash,
                            salt: securePassword.salt,
                            lastOnline: new Date(),
                            phoneCallsEnabled: true,
                            aboutMe: '',
                            coolPoints: 0,
                            badges: [],
                            messageLists: []
                        };
                        db.collection('users').insertOne(user, (err) => {
                            if (err) {
                                handleError('Error creating new user.', err, res);
                            }
                            else {
                                const token = generateJwt(username);
                                const responseBody = { token };
                                res.status(200).send(responseBody);
                            }
                        });
                    }
                });
            }
        });
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
    const username = req.body.username;
    const password = req.body.password;

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
                        const phoneNumberExists = user.phoneNumber && user.phoneNumber.length;
                        const phoneNumberVerified = user.isPhoneNumberConfirmed;
                        res.status(200).send({ 
                            token,
                            phoneNumberExists,
                            phoneNumberVerified
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
                returnError(res, errorMessage, 401);
            }
            else {
                const message = {
                    sentBy: username,
                    dateSent: new Date(),
                    content: req.body.content
                };
                db.collection('conversations').updateOne(
                    { channelId },
                    { $push: { messages: message } }
                );
                db.collection('chatConnections').updateOne(
                    { channelId },
                    { $set: { lastConnected: new Date() } }
                );

                pusher.trigger(channelId, 'message', message);
                res.status(204).send();
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
        if (connections && connections.length > 0) {
            const channelIds = [];
            const usernames = [];
            const usernamesByChannel = {};
            connections.forEach(connection => {
                channelIds.push(connection.channelId);
                const otherUsername = connection.usernames.filter(name => name !== username)[0];
                usernames.push(otherUsername);
                usernamesByChannel[connection.channelId] = otherUsername;
            });

            conversations = await db.collection('conversations')
                .find({ channelId: { $in: channelIds } })
                .project({ channelId: 1, lastMessageDate: 1, lastMessagePreview: 1 })
                .toArray();
            const users = await db.collection('users')
                .find({ username: { $in: usernames } })
                .project({ username: 1, lastOnline: 1 })
                .toArray();
            
            conversations.forEach(conversation => {
                const otherUsername = usernamesByChannel[conversation.channelId];
                const lastOnline = users.filter(user => user.username === otherUsername)[0].lastOnline;

                conversation.username = otherUsername;
                conversation.isOnline = isUserOnline(lastOnline);
            });
        }

        return conversations;
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
        const connections = await db.collection('chatConnections')
            .find({ usernames: username })
            .sort({ lastConnected: -1 })
            .limit(5)
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

        const excludedUsernames = recentUsernames.concat([username]);
        const recentlyOnlineUsers = await db.collection('users')
            .find({ username: { $nin: excludedUsernames } })
            .sort({ lastOnline: -1 })
            .limit(5)
            .toArray();
        
        const usersData = recentlyConnectedUsers.concat(recentlyOnlineUsers);
        const users = usersData.map(user => {
            return {
                isOnline: isUserOnline(user.lastOnline),
                canBeCalled: user.isPhoneNumberConfirmed && user.phoneCallsEnabled,
                username: user.username,
                coolPoints: user.coolPoints,
                badges: user.badges.length
            };
        });
        
        return users;
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

const initializeCall = async (fromUsername, toUsername, db) => {
    try {
        const userInfos = await db.collection('users')
            .find({ username: { $in: [fromUsername, toUsername] } })
            .project({ username: 1, phoneNumber: 1 })
            .toArray();
        const fromPhone = userInfos.filter(user => user.username === fromUsername)[0].phoneNumber;
        const toPhone = userInfos.filter(user => user.username === toUsername)[0].phoneNumber;
        const virtualNumber = await requestVirtualNumber(db);

        await db.collection('phoneCalls').insertOne({
            from: {
                username: fromUsername,
                phoneNumber: fromPhone
            },
            to: {
                username: toUsername,
                phoneNumber: toPhone
            },
            virtualNumber,
            isActive: false
        });

        return virtualNumber;
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
                        initializeCall(username, toUser, db).then(
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
            { virtualNumber },
            { $set: { 
                isActive: true,
                dateStarted: new Date()
            } }
        );

        const targetNumber = phoneCall.to.phoneNumber;
        const ncco = [
            {
                action: 'connect',
                eventUrl: ['https://26f7578f.ngrok.io/event'],
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
        await db.collection('phoneCalls').updateOne(
            { virtualNumber, dateEnded: null },
            { $set: {
                isActive: false,
                dateEnded: new Date()
            } }
        );
        await db.collection('virtualNumbers').updateOne(
            { phoneNumber: virtualNumber },
            { $set: { available: true } }
        );
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