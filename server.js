
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = app.listen(process.env.PORT || 3000, () =>
  console.log("Server running")
);

const wss = new WebSocket.Server({ server });

let devices = {};
let clients = {};
let pairing = {};

function genCode(){
  return Math.floor(100000 + Math.random()*900000).toString();
}

wss.on('connection', ws => {

  ws.on('message', msg => {
    let data = JSON.parse(msg);

    if(data.type === "register-device"){
      devices[data.id] = ws;
      let code = genCode();
      pairing[code] = data.id;
      ws.send(JSON.stringify({type:"pair-code", code}));
    }

    if(data.type === "pair"){
      let dev = pairing[data.code];
      if(dev && devices[dev]){
        clients[data.client] = ws;
        ws.send(JSON.stringify({type:"paired", device:dev}));
      }
    }

    if(data.type === "control"){
      let dev = devices[data.target];
      if(dev) dev.send(JSON.stringify(data));
    }

  });

});
