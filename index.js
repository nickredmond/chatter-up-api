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

Date.prototype.addHours = function(h) {    
    this.setTime(this.getTime() + (h*60*60*1000)); 
    return this;   
}

// todo: ALL IPs ARE WHITELISTED IN ATLAS; change this to production setup when ready
const MongoClient = mongodb.MongoClient;
const databaseUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const databaseName = process.env.DATABASE_NAME || 'heroku_0l0fvk2m'; // default is sandbox
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
                    // cachedDb.collection('donations').createIndex({ dateCreated: -1 });
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
const pusher = null;
app.listen(port, () => {
    console.log("INFO: app started on port " + port);

    pusher = new Pusher({
        appId: PUSHER_APP_ID,
        key: PUSHER_KEY,
        secret: PUSHER_SECRET
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
                        const player = {
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
                        db.collection('users').insertOne(player, (err) => {
                            if (err) {
                                handleError('Error creating new player.', err, res);
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
        db.collection('users').findOne({ username: { $eq: username } }, (err, existingPlayer) => {
            if (err) {
                handleError('Error occurred while logging in.', err, res);
            }
            else if (!existingPlayer) {
                res.status(400).send({ playerExists: false, error: 'Could not find player with that username.' });
            }
            else if (!isPasswordValid(password, existingPlayer.salt, existingPlayer.hash)) {
                res.status(400).send({ playerExists: true, error: 'Password is invalid.' });
            }
            else {
                const token = generateJwt(existingPlayer.name);
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

// app.post("/table", (req, res, next) => {
//     verifyToken(req.body.token, res, playerName => {
//         const table = req.body.table;
//         table.name = table.name ? table.name.toLowerCase().trim() : null;

//         if (table.name) {
//             getDb(res, (db) => {
//                 db.collection('tables').findOne({ name: { $eq: table.name } }, (err, existingTable) => {
//                     if (err) {
//                         handleError('Error querying tables to verify name uniqueness.', err, res);
//                     }
//                     else if (existingTable) {
//                         const errorMessage = 'Table with name ' + table.name + ' is already taken.';
//                         res.status(400).send({ isNameTaken: true, error: errorMessage });
//                     }
//                     else {
//                         const game = getNewGame(table.numberOfPlayers, table.numberOfAiPlayers);
//                         game.createdBy = playerName;

//                         db.collection('games').insertOne(game, (err) => {
//                             if (err) {
//                                 handleError('Error saving new game.', err, res);
//                             }
//                             else {
//                                 table.gameId = game.id;
//                                 table.numberOfHumanPlayers = 0;
//                                 table.isFull = table.numberOfAiPlayers >= table.numberOfPlayers - 1;
//                                 db.collection('tables').insertOne(table, (err) => {
//                                     if (err) {
//                                         handleError('Error saving new table.', err, res);
//                                     }
//                                     else {
//                                         res.status(200).send({ gameId: game.id });
//                                     }
//                                 });
//                             }
//                         });
//                     }
//                 });
//             });
//         }
//         else {
//             res.status(400).send({ error: 'Table name is required.' });
//         }
//     })
// });          getDb(res, (db) => {

const returnError = (errorMessage, statusCode) => {
    const status = statusCode || 500;
    console.log('ERROR (status=' + status + '): ' + errorMessage);
    res.status(status).send({ errorMessage });
};

app.post('/chat/connect', (req, res, next) => {
    verifyToken(req.body.token, res, username => {
        getDb(res, db => {
            const otherUsername = req.body.username;
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
                    returnError(errorMessage);
                }
                else {
                    db.collection('conversations').insertOne(conversation, err => {
                        if (err) {
                            const errorMessage = 'Error inserting connection for users ' + username + ' and ' + otherUsername + ' with channelId ' + channelId + ', msg=' + err;
                            returnError(errorMessage);
                        }
                        else {
                            res.status(200).send({ channelId });
                        }
                    })
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
                { lastConnected: new Date() }
            );
            db.collection('conversations').findOne({ channelId }).then((err, conversation) => {
                if (err || !conversation) {
                    const errorMessage = 'Error fetching conversation with channelId ' + channelId;
                    returnError(errorMessage);
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
            db.collection('chatConnections').findOne({ channelId }).then((err, connection) => {
                if (err || !connection) {
                    const errorMessage = 'Error fetching chatConnection with channelId ' + channelId;
                    returnError(errorMessage);
                }
                else if (!connection.usernames.includes(username)) {
                    const errorMessage = 'User ' + username + ' is not authorized to participate in chat with channelId ' + channelId;
                    returnError(errorMessage, 401);
                }
                else {
                    const message = {
                        sentBy: username,
                        dateSent: new Date(),
                        content: req.body.content
                    };
                    db.collection('conversation').updateOne(
                        { channelId },
                        { $push: { messages: message } }
                    );
                    db.collection('chatConnections').updateOne(
                        { channelId },
                        { lastConnected: new Date() }
                    );

                    pusher.trigger(channelId, 'message', message);
                    res.status(204).send();
                }
            });
        });
    })
});