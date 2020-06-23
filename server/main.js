const cors = require('cors');
const express = require('express');
const expressWS = require('express-ws');
const fs = require('fs');
const helmet = require('helmet');
const http = require('http');
const https = require('https');
const path = require('path');
const Map = require('./map');
const World = require('./world');

const world = new World({
  authService: process.env.AUTH_SERVICE || 'https://blocks.gatunes.com/auth/',
  generator: process.env.GENERATOR || 'default',
  maxClients: process.env.MAX_CLIENTS ? parseInt(process.env.MAX_CLIENTS, 10) : 16,
  name: process.env.NAME || 'Local server',
  seed: process.env.SEED ? parseInt(process.env.SEED, 10) : undefined,
  preload: process.env.PRELOAD ? parseInt(process.env.PRELOAD, 10) : undefined,
  publicURL: process.env.PUBLIC_URL,
  storage: process.env.STORAGE,
});
const map = new Map({ world });

const app = express();
const server = (process.env.TLS_KEY && process.env.TLS_CERT ? https : http).createServer({
  key: process.env.TLS_KEY ? fs.readFileSync(process.env.TLS_KEY) : undefined,
  cert: process.env.TLS_CERT ? fs.readFileSync(process.env.TLS_CERT) : undefined,
}, app).listen(process.env.PORT || 8080, () => (
  console.log(`Listening on port: ${server.address().port}`)
));
app.use(helmet());
expressWS(app, server, { clientTracking: false });

app.ws('/', world.onClient.bind(world));
app.get(
  [
    '/map',
    '/map/@:originX([\\-]?\\d+),:originZ([\\-]?\\d+)(,)?:radius([\\-]?\\d+)?',
  ],
  cors(),
  map.onRequest.bind(map)
);
app.get('/status', world.onStatusRequest.bind(world));
if (process.env.CLIENT !== 'false') {
  app.use(express.static(path.join(__dirname, '..', 'client')));
}
app.use((req, res) => res.status(404).end());
