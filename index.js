const Promise = bluebird = require('bluebird')

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
const wss = new webSocket.Server({ port: 8989 })
let webSockets = {}

// Get globally unique sessionPIN
const getSessionID = async () => {
  do { sessionID = Math.floor(Math.random() * (100000)) }
  while (await client.existsAsync(sessionID))
  return sessionID
}

// Register a new client
const registerClient = async (ws) => {
  webSockets[ws.sessionID] = ws
  let registerRecord = JSON.stringify({ sessionID: ws.sessionID, userID: "" })
  let res = await client.setexAsync(ws.sessionID, 3600, registerRecord)
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
  // React to Pong events
  ws.on('pong', () => {
    ws.isAlive = true
    if (ws.sessionID) { client.expireAsync(sessionID, 3600) }
    console.log(`${ws.sessionID} - alive`)
  })
  // Close websocket connection
  ws.on('close', () => {
    if (ws.sessionID) {
      delete webSockets[ws.sessionID]
      client.delAsync(ws.sessionID)
    }
    console.log(`${ws.sessionID} - closed`)
  })
  // Message on existing websocket connection
  ws.on('message', async (message) => {
    const data = JSON.parse(message)
    switch (data.type) {
      case 'REGISTER_ATTEMPT': {
        ws.sessionID = await getSessionID() 
        await registerClient(ws)
        ws.send(JSON.stringify({
          type: 'REGISTER_SUCCESS',
          sessionID: ws.sessionID
        }))
        break
      }
      case 'RECONNECT_ATTEMPT': {
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
}, 10000)