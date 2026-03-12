const { MongoMemoryServer } = require('mongodb-memory-server');

// One in-memory mongod is shared by every test file; each file uses its own
// database name so the suites stay isolated even when Jest runs them in
// parallel workers.
module.exports = async function globalSetup() {
  const mongod = await MongoMemoryServer.create();
  globalThis.__MONGOD__ = mongod;
  // getUri() ends with a trailing slash; the services expect a base URI without one.
  process.env.MONGO_BASE_URI = mongod.getUri().replace(/\/$/, '');
};
