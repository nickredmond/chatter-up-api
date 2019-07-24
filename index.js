const express = require('express');
const bodyParser = require('body-parser');
const mongodb = require('mongodb');
var crypto = require('crypto');
const uuid = require('uuid/v1'); // v1 is timestamp-based
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const Pusher = require('pusher');

// if anyone sees this and wants to steal it... these hard-coded values are just for sandbox env ;)
const JWT_SECRET = process.env.JWT_SECRET || 'nick[expletive]ingredmond';
const PUSHER_APP_ID = process.env.PUSHER_APP_ID || '826720';
const PUSHER_KEY = process.env.PUSHER_KEY || '0eff4fdefc2715d879a4';
const PUSHER_SECRET = process.env.PUSHER_SECRET || '52e00061be61120ca513';
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER || 'us3';

Date.prototype.addHours = function(h) {    
    this.setTime(this.getTime() + (h*60*60*1000)); 
    return this;   
}
Date.prototype.addMinutes = function(m) {    
    this.setTime(this.getTime() + (m*60*1000)); 
    return this;   
}

// todo: ALL IPs ARE WHITELISTED IN ATLAS; change this to production setup when ready
const MongoClient = mongodb.MongoClient;//mongodb://<dbuser>:<dbpassword>@ds121282.mlab.com:21282/heroku_nmr9k8gp
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
                    handleError('Error connecting to database.', err, res);
                }
                else {
                    cachedDb = client.db(databaseName);
                    // so you may efficiently sort by the field
                    cachedDb.collection('chatConnections').createIndex({ lastConnected: -1 });
                    cachedDb.collection('users').createIndex({ lastOnline: -1 });
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
        db.collection('users').findOne({ name: { $eq: username } }, (err, existingPlayer) => {
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

// maybe use auth lambda gateway or something in future
app.post("/authenticate", (req, res, next) => {
    // use in socket when joining games
    // todo: pass from both app and ws server to refresh exp of token (keep user logged in)
    verifyToken(req.body.token, res, (username) => {
        const refreshedToken = generateJwt(username);
        res.status(200).send({ isAuthenticated: true, refreshedToken });
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
                const token = generateJwt(user.username);
                res.status(200).send({ token });
            }
        });
    });
});

const isTokenExpired = (expiry) => {
    const currentTime = new Date().getTime();
    return expiry <= currentTime;
}

// return playerName if successful
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

const returnError = (res, errorMessage, statusCode) => {
    const status = statusCode || 500;
    console.log('ERROR (status=' + status + '): ' + errorMessage);
    res.status(status).send({ errorMessage });
};

app.post('/chat/connect', (req, res, next) => {
    verifyToken(req.body.token, res, username => {
        getDb(res, db => {
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
});

app.post('/chat/messages', (req, res, next) => {
    verifyToken(req.body.token, res, _ => {
        getDb(res, db => {
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
});

app.post('/chat/message', (req, res, next) => {
    verifyToken(req.body.token, res, username => {
        getDb(res, db => {
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
    })
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

        if (!connections || connections.length === 0) {
            res.status(200).send([]);
        }
        else {
            const channelIds = [];
            const usernames = [];
            const usernamesByChannel = {};
            connections.forEach(connection => {
                channelIds.push(connection.channelId);
                const otherUsername = connection.usernames.filter(name => name !== username)[0];
                usernames.push(otherUsername);
                usernamesByChannel[connection.channelId] = otherUsername;
            });

            const conversations = await db.collection('conversations')
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
            
            return conversations;
        }
    } catch(err) {
        console.log('ERROR /messages/list: ', err);
        throw err;
    }
}

app.post('/messages/list', (req, res, next) => {
    verifyToken(req.body.token, res, username => {
        getDb(res, db => {
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
    verifyToken(req.body.token, res, username => {
        getDb(res, db => {
            getUsers(username, db).then(
                users => {
                    res.status(200).send(users);
                },
                _ => {
                    res.status(500).send();
                }
            )
        });
    });
});