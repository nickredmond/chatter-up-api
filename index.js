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
const MAX_CALL_HRS_PER_MONTH = process.env.MAX_CALL_HRS_PER_MONTH || 50;

const BADGE_FRIENDLY_MINIMUM_RATINGS = parseInt(process.env.BADGE_FRIENDLY_MINIMUM_RATINGS);
const BADGE_FRIENDLY_MINIMUM_THRESHOLD = parseFloat(process.env.BADGE_FRIENDLY_MINIMUM_THRESHOLD);
const BADGE_ALLSTAR_MINIMUM_CALLS = parseInt(process.env.BADGE_ALLSTAR_MINIMUM_CALLS);
const BADGE_ALLSTAR_MINIMUM_CALL_LENGTH_MINUTES = parseInt(process.env.BADGE_ALLSTAR_MINIMUM_CALL_LENGTH_MINUTES);

Date.prototype.addDays = function(d) {
    this.setTime(this.getTime() + (d*24*60*60*1000)); 
    return this; 
}
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

// BEGIN: Workers

const EXPLORER_BADGE_KEY = 'explorer';
const ALLSTAR_BADGE_KEY = 'allStar';
/** get any call recipient badge that's due. assumes user has taken call from new person 
 * for minimum time required. */
const getCallRecipientBadge = (user) => {
    let badgeAwarded = null;

    if (!user.badges.filter(badge => badge.key === EXPLORER_BADGE_KEY).length) {
        badgeAwarded = {
            key: EXPLORER_BADGE_KEY,
            icon: 'map',
            iconSet: 'font-awesome',
            name: 'Testing the Waters',
            description: 'Has taken their first phone call and conversed with someone!'
        }
    }
    else if (!user.badges.filter(badge => badge.key === ALLSTAR_BADGE_KEY).length && 
        user.calledBy.length >= BADGE_ALLSTAR_MINIMUM_CALLS - 1) {

        badgeAwarded = {
            key: ALLSTAR_BADGE_KEY,
            icon: 'star',
            iconSet: 'font-awesome',
            name: 'All-Star Receiver',
            description: 'Has taken numerous phone calls from different people, and is obviously an example in the community of good listening.'
        }
    }

    return badgeAwarded;
}

/** 
 * checks if user has received enough phone calls to be awarded "allstar" badge.
 * should be run at end of each phone call.
 */
const updateCallRecipient_worker = async (db, fromUsername, toUsername, dateStarted, dateEnded) => {
    try {
        const diffMs = dateEnded - dateStarted;
        const callLengthMinutes = diffMs / 1000 / 60;

        if (callLengthMinutes >= BADGE_ALLSTAR_MINIMUM_CALL_LENGTH_MINUTES) {
            const user = await db.collection('users').findOne(
                { username: toUsername },
                { badges: 1, calledBy: 1 }
            );

            if (!user.calledBy.includes(fromUsername)) {
                const userUpdate = {
                    $push: { calledBy: fromUsername }
                };
                const badgeAwarded = getCallRecipientBadge(user);
                if (badgeAwarded) {
                    userUpdate['$push']['badges'] = badgeAwarded;
                }

                await db.collection('users').updateOne(
                    { _id: user._id }, 
                    userUpdate
                );
            }
        }
    } catch(err) {
        console.log('>> ERROR (updateCallRecipient worker): ', err);
    }
}

/** 
 * updates user that has been rated. awards user coolPoints if applicable,  
 * and awards "friendly" badge if eligible.
*/
const updateUserRated_worker = async (db, usernameRated, ratedByUsername, ratingText) => {
    try {
        const userRated = await db.collection('users').findOne(
            { username: usernameRated },
            { ratingCounts: 1, ratedBy: 1, badges: 1 }
        );
        const updates = {};
        let hasUpdates = false;
        
        const coolPointsEarned = COOLPOINTS_BY_RATING[ratingText] || 0;
        if (coolPointsEarned > 0) {
            hasUpdates = true;
            updates['$inc'] = { coolPoints: coolPointsEarned };
        }

        const isNewRating = !userRated.ratedBy.includes(ratedByUsername);
        if (isNewRating) {
            hasUpdates = true;
            const ratingIncrement = coolPointsEarned ? 'positive' : 'negative';
            if (!updates['$inc']) {
                updates['$inc'] = {};
            }
            updates['$inc']['ratingCounts.' + ratingIncrement] = 1;
            updates['$push'] = { ratedBy: ratedByUsername };

            userRated.ratingCounts[ratingIncrement]++;
        }

        if (isFriendlyBadgeAwarded(userRated.badges, userRated.ratingCounts)) {
            hasUpdates = true;
            if (!updates['$push']) {
                updates['$push'] = {};
            }
            updates['$push']['badges'] = {
                key: FRIENDLY_BADGE_KEY,
                icon: 'heart',
                iconSet: 'font-awesome',
                name: 'Friend in Me',
                description: 'User is regarded in the TalkItOut community with numerous positive ratings ' +
                    'from a variety of different users.'
            };
        }
        
        if (hasUpdates) {
            await db.collection('users').updateOne(
                { _id: userRated._id },
                updates
            );
        }
    } catch(err) {
        console.log('>> ERROR (updateUserRated worker): ', err);
    }
}

// END: Workers

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
                    cachedDb.collection('phoneCalls').createIndex({ dateStarted: 1 });
                    cachedDb.collection('phoneCalls').createIndex({ 'from.username': 1 });
                    cachedDb.collection('phoneCalls').createIndex({ 'to.username': 1 });

                    // yes, this is boolean index for "where isActive = true" searches, since most 
                    // phoneCalls are not active.
                    cachedDb.collection('phoneCalls').createIndex({ isActive: 1}); 

                    cachedDb.collection('conversations').createIndex({ channelId: 1 });
                    cachedDb.collection('conversations').createIndex({ lastMessagePreview: 1 });
                    cachedDb.collection('supportRequests').createIndex({ dateCreated: -1 });
                    cachedDb.collection('virtualNumbers').createIndex({ phoneNumber: 1 });
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
                                blockedUsernames: [],
                                ratingCounts: {
                                    positive: 0,
                                    negative: 0
                                },
                                ratedBy: [],
                                calledBy: []
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
                    const skipPhoneNumberValidation = true;
                    checkUserStatus(user.username, db, res, user, skipPhoneNumberValidation).then(
                        isValid => {
                            if (isValid) {
                                const token = generateJwt(user.username);
                                const phoneNumberExists = user.phoneNumber && user.phoneNumber.length > 0;
                                const phoneNumberVerified = user.isPhoneNumberConfirmed;
                                res.status(200).send({ 
                                    token,
                                    phoneNumberExists,
                                    phoneNumberVerified,
                                    socketReceiveId: user.socketReceiveId
                                });
                            }
                            else {
                                console.log('>> WARN: invalid user ' + username + ' tried making request.');
                            }
                        },
                        err => {
                            console.log('ERROR validating user (/log-in): ', err);
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

const checkUserStatus = async (username, db, res, existingUser, skipPhoneNumberValidation) => {
    let user = existingUser;
    if (!user) {
        user = await db.collection('users').findOne(
            { username },
            { isSuspended: 1, isPhoneNumberConfirmed: 1 }
        );
    }

    await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { lastOnline: new Date() } }
    );

    let isValid = false;
    if (user.isSuspended) {
        res.status(497).send({ errorMessage: 'Your account has been suspended.' });
    }
    else if (!(skipPhoneNumberValidation || user.isPhoneNumberConfirmed)) {
        res.status(403).send({ errorMessage: 'Your phone number has not been confirmed.' });
    }
    else {
        isValid = true;
    }

    return isValid;
}

const authenticatedDb = (req, res, onSuccess) => {
    verifyToken(req.body.token, res, username => {
        getDb(res, db => {
            checkUserStatus(username, db, res).then(
                isValid => {
                    if (isValid) {
                        onSuccess(username, db);
                    }
                    else {
                        console.log('>> WARN: invalid user ' + username + ' tried making request.');
                    }
                },
                err => {
                    console.log('ERROR validating user (/log-in): ', err);
                    res.status(500).send();
                }
            );
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
                    lastMessagePreview: { $ne: null }
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

        const activeCalls = await db.collection('phoneCalls')
            .find({
                isActive: true,
                $or: [
                    { 'from.username': { $in: distinctUsernames } },
                    { 'to.username': { $in: distinctUsernames } }
                ]
            })
            .toArray();
        const activeUsernames = [];
        for (let i = 0; i < activeCalls.length; i++) {
            activeUsernames.push(activeCalls[i].from.username);
            activeUsernames.push(activeCalls[i].to.username);
        }

        for (let i = 0; i < distinctUsers.length; i++) {
            distinctUsers[i].canBeCalled = distinctUsers[i].canBeCalled && !activeUsernames.includes(distinctUsers[i].username);
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
        const isInCall = await db.collection('phoneCalls').findOne({
            isActive: true,
            $or: [
                { 'from.username': username },
                { 'to.username': username }
            ]
        });
        const isOnline = isUserOnline(user.lastOnline);

        return {
            username: user.username,
            about: user.aboutMe,
            coolPoints: user.coolPoints,
            badges: user.badges,
            lastOnline: isOnline ? null : user.lastOnline,
            isOnline,
            canBeCalled: user.isPhoneNumberConfirmed && user.phoneCallsEnabled && !isInCall
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
                { phoneNumber }
            );
            if (existingUser) {
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
        try {
            if (!CURRENT_VIRTUAL_NUMBER_REQUEST && VIRTUAL_NUMBERS_QUEUE.length) {
                console.log('>>> gettingVirtual#... qSize=' + VIRTUAL_NUMBERS_QUEUE.length);
                CURRENT_VIRTUAL_NUMBER_REQUEST = VIRTUAL_NUMBERS_QUEUE.splice(0, 1)[0];
                const callback = CURRENT_VIRTUAL_NUMBER_REQUEST.callback;
                const db = CURRENT_VIRTUAL_NUMBER_REQUEST.db;
                const requestedBy = CURRENT_VIRTUAL_NUMBER_REQUEST.requestedBy;
                getVirtualNumber(db, requestedBy).then(
                    result => {
                        if (result.virtualNumber) {
                            console.log('>>> virtual# retrieved: ' + result.virtualNumber);
                        }
                        callback(result);
                        CURRENT_VIRTUAL_NUMBER_REQUEST = null;
                    },
                    err => {
                        console.log('>>> CRITICAL ERROR: could not retrieve virtual number -- ', err);
                        CURRENT_VIRTUAL_NUMBER_REQUEST = null;
                    }
                )
            }
        } catch(err) {
            console.log('>>> CRITICAL: error in virtual numbers queue! ', err);
            try {
                getDb(null, db => {
                    db.collection('errors').insertOne({
                        errorType: 'virtualNumbersQueueError',
                        stackTrace: err
                    });
                })
            } catch(err) {
                console.log('>>> CRITICAL: cannot connect to DB saving error! ', err);
            }
        }
    }, 500);
}

const getVirtualNumber = async (db, requestedBy) => {
    try {
        const virtualNumbers = await db.collection('virtualNumbers')
            .find({ available: true })
            .toArray();
        if (virtualNumbers.length) {
            const availableNumber = virtualNumbers[0].phoneNumber;
            await db.collection('virtualNumbers').updateOne(
                { phoneNumber: availableNumber },
                { $set: { 
                    requestedBy,
                    available: false 
                } }
            );
            return { virtualNumber: availableNumber };
        }
        else {
            console.log('>>> CRITICAL: No virtual numbers are currently available!');
            await db.collection('errors').insertOne({
                errorType: 'noAvailableVirtualNumbers',
                timestamp: new Date()
            });
            return { noAvailableNumbers: true };
        }
    } catch(err) {
        console.log('ERROR getting available virtual number (or renting one): ', err);
        throw err;
    }
}

const NO_NUMBERS_AVAILABLE = 601;
const queueVirtualNumber = (db, requestedBy) => {
    return new Promise((resolve, reject) => {
        let isNumberRetrieved = false;
        VIRTUAL_NUMBERS_QUEUE.push({
            db,
            requestedBy,
            callback: (result) => {
                isNumberRetrieved = true;
                if (result.virtualNumber) {
                    console.log('>>> virtual# resolved: ' + result.virtualNumber);
                    resolve(result.virtualNumber);
                }
                else {
                    reject(NO_NUMBERS_AVAILABLE);
                }
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

const getTotalCallHoursPastMonth = async (db) => {
    const oneMonthAgo = new Date();
    oneMonthAgo.addDays(-30);
    const phoneCallLengthsPastMonth = await db.collection('phoneCalls')
        .find({ dateStarted: { $gt: oneMonthAgo }, dateEnded: { $exists: true } })
        .project({ dateStarted: 1, dateEnded: 1 })
        .map(phoneCall => {
            const callLengthMs = phoneCall.dateEnded - phoneCall.dateStarted;
            return callLengthMs;
        })
        .toArray();
    
    let totalCallLengthMilliseconds = 0;
    for (let i = 0; i < phoneCallLengthsPastMonth.length; i++) {
        totalCallLengthMilliseconds += phoneCallLengthsPastMonth[i];
    }
    const totalCallLengthHours = totalCallLengthMilliseconds / 1000 / 60 / 60;
    return totalCallLengthHours;
}

const MAX_CALL_HOURS_EXCEEDED = 602;
const requestVirtualNumber = async (db, requestedBy) => {
    const totalCallHoursPastMonth = await getTotalCallHoursPastMonth(db);
    if (totalCallHoursPastMonth >= MAX_CALL_HRS_PER_MONTH) {
        console.log('>>> CRITICAL: Maximum call hours have been exceeded for the month!');
        await db.collection('errors').insertOne({
            errorType: 'maxCallHoursExceeded',
            maxCallHours: MAX_CALL_HRS_PER_MONTH,
            timestamp: new Date()
        });
        throw MAX_CALL_HOURS_EXCEEDED;
    }
    else {
        const virtualNumber = await queueVirtualNumber(db, requestedBy);
        return virtualNumber;
    }
}

/** END: VIRTUAL NUMBERS QUEUE */

const isUserAvailable = async (username, db) => {
    try {
        const phoneCalls = await db.collection('phoneCalls')
            .find({
                isActive: true,
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
            const virtualNumber = await requestVirtualNumber(db, fromUsername);

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
                            error => {
                                if (error && (error === NO_NUMBERS_AVAILABLE || error === MAX_CALL_HOURS_EXCEEDED)) {
                                    res.status(565).send({ errorMessage: 'Phone call server limits have been exceeded!' });
                                }
                                else {
                                    res.status(500).send();
                                }
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

        console.log('>> MEMO: phoneCall ID ' + phoneCall._id + ' to connect from user ' + phoneCall.from.username + 
            ' to user ' + phoneCall.to.username);
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
        console.log('>> MEMO: ' + phoneCall.from.username + ', ' + fromUser.socketReceiveId)
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
            { dateStarted: 1, from: 1, to: 1 }
        );
        if (phoneCall) {
            const dateEnded = new Date();
            setTimeout((database, from, to, startedOn, endedOn) => {
                updateCallRecipient_worker(database, from, to, startedOn, endedOn);
            }, 0, db, phoneCall.from.username, phoneCall.to.username, phoneCall.dateStarted, dateEnded);

            await db.collection('phoneCalls').updateOne(
                { _id: phoneCall._id },
                { $set: {
                    isActive: false,
                    dateEnded
                } }
            );
            await db.collection('virtualNumbers').updateOne(
                { phoneNumber: virtualNumber },
                { $set: { available: true } }
            );
        }
        else {
            console.log('>> WARN: phoneCall with virtual number ' + virtualNumber + ' was ended, but phoneCall record cannot be found.');
        }
    } catch(err) {
        console.log('ERROR ending call (NEXMO /event): ', err);
    }
}

 app.post('/event', (req, res, next) => {
    console.log('NEXMO CALL EVENT (/event): ', req.body);
    if (req.body && req.body.status === 'completed') {
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
            description: requestBody.description,
            dateCreated: new Date()
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
});

const saveContactRequest = async (username, description, db) => {
    try {
        await db.collection('supportRequests').insertOne({
            username,
            description,
            dateCreated: new Date()
        });
    } catch(err) {
        console.log('ERROR /contact: ', err);
        throw err;
    }
}

app.post('/contact', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        const description = req.body ? req.body.description : null;
        if (description) {
            saveContactRequest(username, description, db).then(
                _ => {
                    res.status(204).send();
                },
                _ => {
                    res.status(500).send();
                }
            )
        }
        else {
            res.status(400).send({ errorMessage: 'Description is required.' });
        }
    });
})

/** END: SUPPORT ENDPOINTS */

const FRIENDLY_BADGE_KEY = 'friendly';
isFriendlyBadgeAwarded = (badges, ratingCounts) => {
    let awarded = false;
    const totalRatings = ratingCounts.positive + ratingCounts.negative;
    
    if (!badges.filter(badge => badge.key === FRIENDLY_BADGE_KEY).length && 
        totalRatings >= BADGE_FRIENDLY_MINIMUM_RATINGS) {
            
        const percentagePositveRatings = ratingCounts.positive / totalRatings;
        awarded = percentagePositveRatings >= BADGE_FRIENDLY_MINIMUM_THRESHOLD;
    }

    return awarded;
        
}

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
                
                setTimeout((database, nameRated, ratedBy, rating) => {
                    updateUserRated_worker(database, nameRated, ratedBy, rating);
                }, 0, db, usernameRated, username, ratingText);
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
    });
});

const releaseNumber = async (username, virtualNumber, db) => {
    try {
        const result = await db.collection('virtualNumbers').updateOne(
            {
                phoneNumber: virtualNumber,
                requestedBy: username
            },
            { $set: { available: true } }
        );
        if (!result.matchedCount) {
            console.log('>> WARNING: user ' + username + ' tried releasing number ' + virtualNumber +
                ', but number either doesn\'t exist or was not most recently requested by that user.');
        }
    } catch(err) {
        console.log('ERROR /virtualNumber/release: ', err);
        throw err;
    }
}

app.post('/virtualNumber/release', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        if (req.body.virtualNumber) {
            releaseNumber(username, req.body.virtualNumber, db).then(
                _ => {
                    res.status(204).send();
                },
                _ => {
                    res.status(500).send();
                }
            );
        }
        else {
            res.status(400).send({ errorMessage: 'Virtual number is required.' });
        }
    });
});

const getFaqs = async (db) => {
    try {
        return await db.collection('faqs').find().toArray();
    } catch(err) {
        console.log('ERROR /faq: ', err);
        throw err;
    }
}

app.post('/faq', (req, res, next) => {
    authenticatedDb(req, res, (username, db) => {
        getFaqs(db).then(
            faqs => {
                res.status(200).send(faqs);
            },
            _ => {
                res.status(500).send();
            }
        )
    });
})