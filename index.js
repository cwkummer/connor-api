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

// Generate random integer
const getRandomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Check for 
const updateMapping = async () => {
  await client.set(, "string val", 
  console.log(res)
}

// Receive sub messages and send to websocket if exists
sub.on('message', (channel, msg) => {
  let sessionID = JSON.parse(msg).sessionID
  if ((sessionID) && (webSockets[sessionID])) { webSockets[sessionID].send(msg) }
})

wss.on('connection', (ws) => {
  // New websocket connection
  let sessionID
  do {
    sessionID = getRandomInt(0, 99999)
  } while (webSockets[sessionID])
  webSockets[sessionID] = ws
  ws.send(JSON.stringify({
    type: 'REGISTER_SUCCESS',
    sessionID: sessionID
  }))
  let message = JSON.stringify({
    type: 'NEW_CLIENT',
    sessionID: sessionID
  })
  pub.publish('connor-global', message)
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