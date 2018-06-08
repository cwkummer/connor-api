const Promise = bluebird = require('bluebird')
const uuid = require('uuid/v4');

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
const getSessionPIN = async () => {
  do { sessionPIN = Math.floor(Math.random() * (100000)) }
  while (await client.existsAsync(sessionPIN))
  return sessionPIN
}

// Receive sub messages and send to target websocket if it exists
sub.on('message', (channel, msg) => {
  let sessionID = JSON.parse(msg).sessionID
  if ((sessionID) && (webSockets[sessionID])) { webSockets[sessionID].send(msg) }
})

wss.on('connection', async (ws) => {
  // New websocket connection
  let sessionPIN = await getSessionPIN() 
  let sessionID = uuid()
  ws.isAlive = true
  ws.sessionID = sessionID
  ws.sessionPIN = sessionPIN
  webSockets[sessionID] = ws
  let registerRecord = JSON.stringify({ sessionID: sessionID, userID: "" })
  let res = await client.setAsync(sessionPIN, registerRecord)
  ws.send(JSON.stringify({
    type: 'REGISTER_SUCCESS',
    sessionPIN: sessionPIN,
    sessionID: sessionID
  }))
  let message = JSON.stringify({
    type: 'NEW_CLIENT',
    sessionPIN: sessionPIN,
    sessionID: sessionID
  })
  pub.publish('connor-global', message)
  // React to Pong events
  ws.on('pong', () => {
    ws.isAlive = true
    console.log(`${ws.sessionID} is alive!`)
  })
  // Close websocket connection
  ws.on('close', () => { delete webSockets[sessionID] })
  // Message on existing websocket connection
  ws.on('message', async (message) => {
    const data = JSON.parse(message)
    switch (data.type) {
      case 'REGISTER_ATTEMPT': {        
        break
      }
      default:
        break
    }
  })
})

// Ping all websockets every 10 seconds
setInterval(() => {
  console.log(Object.keys(webSockets).length)
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log(`${ws.sessionID} is dead!`)
      return ws.terminate()
    }
    ws.isAlive = false
    console.log(`Pinging ${ws.sessionID}`)
    ws.ping(null, false, true)
  })
}, 10000)