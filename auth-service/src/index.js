'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { config, missingEnv } = require('./config');
const { createApp } = require('./app');
const { closeAll } = require('./tenancy/connectionPool');

const missing = missingEnv();
if (missing.length > 0) {
  console.error(`Auth Service: missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

async function start() {
  await mongoose.connect(config.registryUri, {
    maxPoolSize: config.tenancy.poolSize,
    serverSelectionTimeoutMS: config.tenancy.serverSelectionTimeoutMs,
  });
  console.log('Auth Service: connected to registry DB');

  const server = createApp().listen(config.port, () => {
    console.log(`Auth Service running on port ${config.port}`);
  });

  // Per-clinic pools hold sockets open against MongoDB. Dropping the process
  // without closing them leaves the server holding connection slots until they
  // time out, which matters when a deploy restarts every replica at once.
  async function shutdown(signal) {
    console.log(`Auth Service: ${signal} received, shutting down`);
    server.close();
    await closeAll();
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  }

  ['SIGTERM', 'SIGINT'].forEach((signal) => {
    process.once(signal, () => {
      shutdown(signal).catch(() => process.exit(1));
    });
  });
}

start().catch((err) => {
  console.error('Auth Service: startup failed:', err.name, err.message);
  process.exit(1);
});
