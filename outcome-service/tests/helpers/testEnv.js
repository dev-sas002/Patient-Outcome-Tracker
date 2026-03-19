const mongoose = require('mongoose');

const JWT_SECRET = 'test-only-secret-not-a-real-credential';

/**
 * Point the service at the shared in-memory mongod, using a database namespace
 * unique to the calling test file. Must run before the app/models are required
 * so nothing picks up a stale connection.
 */
function configureEnv(namespace) {
  const baseUri = process.env.MONGO_BASE_URI;
  if (!baseUri) {
    throw new Error('MONGO_BASE_URI is not set; jest globalSetup did not run');
  }
  process.env.MONGODB_BASE_URI = baseUri;
  process.env.MONGODB_REGISTRY_URI = `${baseUri}/${namespace}_registry`;
  process.env.JWT_SECRET = JWT_SECRET;
  return { baseUri, namespace };
}

async function connectRegistry() {
  await mongoose.connect(process.env.MONGODB_REGISTRY_URI);
}

async function dropAll(namespace) {
  const admin = mongoose.connection.getClient().db().admin();
  const { databases } = await admin.listDatabases();
  for (const db of databases) {
    if (db.name.startsWith(namespace)) {
      await mongoose.connection.getClient().db(db.name).dropDatabase();
    }
  }
}

module.exports = { JWT_SECRET, configureEnv, connectRegistry, dropAll };
