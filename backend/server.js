const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '.env'),
  quiet: true
});

const app = require('./app');
const database = require('./config/database');

const port = Number(process.env.PORT) || 3000;
let server;
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received. Shutting down Saple API.`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  try {
    await database.closePool();
    process.exit(0);
  } catch (error) {
    console.error('Failed to close the database pool:', error);
    process.exit(1);
  }
}

async function startServer() {
  try {
    await database.initializePool();

    server = app.listen(port, () => {
      console.log(`Saple API running on port ${port}.`);
    });
  } catch (error) {
    console.error('Saple API startup failed:', error.message);
    process.exitCode = 1;
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();
