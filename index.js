const webSocket = require('ws')
const wss = new webSocket.Server({ port: 8989 })
let webSockets = {}

const aws = require('aws-sdk')
aws.config.update({region:'us-west-1'});
const sqs = new aws.SQS();

const MongoClient = require('mongodb').MongoClient;
const mongoURL = "mongodb://localhost:27017";

(async () => {

  const client = await MongoClient.connect(mongoURL);
  let records = client.db("websocket").collection("records");

  const queueURL = "https://sqs.us-west-1.amazonaws.com/340163624142/connor";
  const queueParams = {
   AttributeNames: [
      "SentTimestamp",
      "SessionID"
   ],
   MaxNumberOfMessages: 10,
   MessageAttributeNames: [
      "All"
   ],
   QueueUrl: queueURL,
   WaitTimeSeconds: 0
  };

  let sqsTimeID = setInterval(async () => {
    let data = await sqs.receiveMessage(queueParams).promise()
    if (data.Messages) {
      const deleteParams = {
        QueueUrl: queueURL,
        ReceiptHandle: data.Messages[0].ReceiptHandle
      }
      data.Messages.forEach((msg) => {
        let body = JSON.parse(msg.Body)
        let sessionID = body.sessionID
        if ((sessionID) && (webSockets[sessionID])) {
          webSockets[sessionID].send(JSON.stringify({
            type: body.type,
            sessionID: sessionID,
            data: body.data
          }))
        }
      })
      await sqs.deleteMessage(deleteParams).promise()
    }
  }, 200);

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({
      type: 'HELLO',
      message: 'Hello there!'
    }))
    ws.on('message', async (message) => {
      const data = JSON.parse(message)
      switch (data.type) {
        case 'REGISTER_ATTEMPT': {
          let duplicateID = await records.findOne({"sessionID":data.sessionID});
          if (duplicateID) {
            ws.send(JSON.stringify({
              type: 'REGISTER_FAIL',
              sessionID: data.sessionID
            })) 
          } else {
            await records.insert({"sessionID":data.sessionID})
            ws.send(JSON.stringify({
              type: 'REGISTER_SUCCESS',
              sessionID: data.sessionID
            }))
            webSockets[data.sessionID] = ws
          }
          break
        }
        case 'RELEASE_ATTEMPT': {
          await records.findOneAndDelete({"sessionID":data.sessionID})
          ws.send(JSON.stringify({
            type: 'RELEASE_SUCCESS',
            sessionID: data.sessionID
          })) 
          break
        }
        default:
          break
      }
    })
    ws.on('close', () => {})
  })

})();