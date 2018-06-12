const Promise = bluebird = require('bluebird')
const winston = require('winston');

// Connect to redis
const redis = require('redis')
bluebird.promisifyAll(redis)
const redis_address = 'redis://127.0.0.1:6379'
const client = redis.createClient(redis_address)
const pub = redis.createClient(redis_address)
const sub = redis.createClient(redis_address)
sub.subscribe('connor-global')

// Configure websocket server
const webSocket = require('ws')
let wsPort = process.env.WS_PORT || 8989
const wss = new webSocket.Server({ port: wsPort })
winston.info(`connor-api: Websocket server started on port ${wsPort}`)
let webSockets = {}

// Configure REST server
const express = require('express')
const cors = require('cors')
const compression = require('compression')
const bodyParser = require('body-parser')
const app = express()
const router = express.Router()
app.use(cors())
app.use(compression())
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/api', router)
app.use((err, req, res) => {
  handleError(err, req, res); /* eslint-disable-line */
});
let restPort = process.env.REST_PORT || 8990
app.listen(restPort)
winston.info(`connor-api: REST server started on port ${restPort}`)

const handleError = (err, req, res) => {
  winston.error('connor-api - ', err);
  return res.sendStatus(err.status || 500);
};

// Get globally unique sessionID
const getSessionID = async () => {
  do { sessionID = Math.floor(Math.random() * 90000) + 10000 }
  while (await client.existsAsync(sessionID))
  return sessionID
}

// Register a new client
const registerClient = async (ws) => {
  webSockets[ws.sessionID] = ws
  let registerRecord = JSON.stringify({ sessionID: ws.sessionID, isPaired: false })
  await client.setexAsync(ws.sessionID, 3600, registerRecord)
  let message = JSON.stringify({
    type: 'NEW_CLIENT',
    sessionID: ws.sessionID
  })
  pub.publish('connor-global', message)
}

// Receive sub messages and send to target websocket if it exists
sub.on('message', (channel, msg) => {
  let sessionID = JSON.parse(msg).sessionID
  if ((sessionID) && (webSockets[sessionID])) { webSockets[sessionID].send(msg) }
})

wss.on('connection', async (ws) => {
  ws.isAlive = true
  // Pong event
  ws.on('pong', () => {
    ws.isAlive = true
    if (ws.sessionID) { client.expireAsync(ws.sessionID, 3600) }
    console.log(`${ws.sessionID} - alive`)
  })
  // Close event
  ws.on('close', () => {
    if (ws.sessionID) {
      delete webSockets[ws.sessionID]
      client.delAsync(ws.sessionID)
    }
    console.log(`${ws.sessionID} - closed`)
  })
  // Message event
  ws.on('message', async (message) => {
    const data = JSON.parse(message)
    switch (data.type) {
      case 'CONNECT_ATTEMPT': {
        ws.sessionID = await getSessionID()
        await registerClient(ws)
        ws.send(JSON.stringify({
          type: 'CONNECT_SUCCESS',
          sessionID: ws.sessionID
        }))
        break
      }
      case 'RECONNECT_ATTEMPT': {
        // Check for required fields (sessionID and easeID)
        if ((!data.sessionID) || (!data.easeID)) {
          ws.send(JSON.stringify({ type: 'RECONNECT_FAILURE', error: 400 }))
          break
        }
        // Check that reg record exists
        let regRecord = await client.getAsync(data.sessionID)
        if (!regRecord) {
          ws.send(JSON.stringify({ type: 'RECONNECT_FAILURE', error: 404 }))
          break
        }
        // Check that easeID matches and reg record is paired
        regRecord = JSON.parse(regRecord)
        if ((!regRecord.isPaired) || (regRecord.easeID !== data.easeID)) {
          ws.send(JSON.stringify({ type: 'RECONNECT_FAILURE', error: 403 }))
          break
        }
        ws.sessionID = data.sessionID
        await registerClient(ws)
        ws.send(JSON.stringify({
          type: 'RECONNECT_SUCCESS',
          sessionID: ws.sessionID
        }))
        break
      }
      default:
        pub.publish('connor-global', message)
        break
    }
  })
})

// Ping all websockets every 10 seconds
setInterval(async () => {
  console.log(Object.keys(webSockets).length)
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log(`${ws.sessionID} - dead`)
      return ws.terminate()
    }
    ws.isAlive = false
    console.log(`${ws.sessionID} - ping`)
    ws.ping(null, false, true)
  })
}, 3000)

// REST route - Health check
router.route('/healthcheck').get((req, res) => res.sendStatus(200))

// REST route - POST from EASE of records to verify on ChromeBook
router.route('/sendVerify').post((req, res) => {
  try {
    console.log(req.body)
    pub.publish('connor-global', JSON.stringify(req.body))
    return res.sendStatus(200)
  } catch (err) {
    handleError(err, req, res);
  }
})

// REST route - Post from ease to "pair"
router.route('/pair').post(async (req, res) => {
  try {
    // Check for required fields (sessionID and easeID)
    if ((!req.body.sessionID) || (!req.body.easeID)) { return res.sendStatus(400) }
    // Check that reg record exists
    let curRegRecord = await client.getAsync(req.body.sessionID)
    if (!curRegRecord) { return res.sendStatus(404) }
    // Check that reg record is not paired
    if (curRegRecord.isPaired) { return res.sendStatus(403) }
    let newRegRecord = JSON.stringify({ sessionID: req.body.sessionID, isPaired: true, easeID: req.body.easeID })
    await client.setexAsync(req.body.sessionID, 3600, newRegRecord)
    return res.sendStatus(200)
  } catch (err) {
    handleError(err, req, res);
  }
})