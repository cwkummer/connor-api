// const { checkEnvVars } = require('./utils');
// checkEnvVars(); // Must run before env variables are used

// if (process.env.NODE_ENV !== 'development') { require('newrelic') }

const cors = require('cors')
const compression = require('compression')
const bodyParser = require('body-parser')
const winston = require('winston')
const express = require('express')
const app = express()
const expressWs = require('express-ws')(app)

// Configure express middleware
app.use(cors())
app.use(compression())
app.use(bodyParser.json())
app.use((err, req, res, next) => {
  winston.error('dmv-sos-api-node - ', err)
  if (err.status === 401) { res.sendStatus(401) }
  else { res.sendStatus(500) }
});

// Start application
const port = process.env.PORT;
app.listen(process.env.PORT)
winston.info(`dmv-sos-api-node: Started on port ${port}`)

// Generate random integer
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

let webSockets = {}

app.ws('/', (ws, req) => {
  // New websocket connection
  console.log("here")
  let sessionID
  do { sessionID = getRandomInt(0,99999) } while (!webSockets[sessionID])
  webSockets[sessionID] = ws
  ws.send(JSON.stringify({
    type: 'REGISTER_SUCCESS',
    sessionID: sessionID
  }))
  // Close websocket connection
  ws.on('close', () => { delete webSockets[sessionID] })
  // Message on existing websocket connection
  ws.on('message', async (message) => {
    const data = JSON.parse(message)
    switch (data.type) {
      case 'XYZ': { 
        break
      }
      default:
        break
    }
  })
})
 
app.post('/', (req, res, next) => {
  let sessionID = req.body.sessionID
  if ((sessionID) && (webSockets[sessionID])) {
    webSockets[sessionID].send(JSON.stringify({
      type: body.type,
      sessionID: sessionID,
      data: body.data
    }))
  }
})