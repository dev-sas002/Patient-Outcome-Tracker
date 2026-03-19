const { configureEnv } = require('./helpers/testEnv');

const NAMESPACE = 'connpool';
configureEnv(NAMESPACE);

const { createConnectionPool } = require('../src/tenancy/connectionPool');

const silentLogger = { log: () => {}, error: () => {} };

/**
 * A fake mongoose connection. `asPromise` is what the pool awaits, so a
 * rejecting one models a clinic whose database is unreachable.
 */
function fakeConnection({ fail = false } = {}) {
  const conn = {
    closed: 0,
    models: {},
    model(name, schema) {
      if (schema) conn.models[name] = { name, schema };
      return conn.models[name];
    },
    asPromise: () => (fail ? Promise.reject(new Error('handshake failed')) : Promise.resolve(conn)),
    close: async () => {
      conn.closed += 1;
    },
  };
  return conn;
}

function poolWith(connections, options = {}) {
  const opened = [];
  const pool = createConnectionPool({
    baseUri: 'mongodb://fake',
    logger: silentLogger,
    evictionDrainMs: 0,
    createConnection: (uri) => {
      const conn = connections.shift() || fakeConnection();
      conn.uri = uri;
      opened.push(conn);
      return conn;
    },
    ...options,
  });
  return { pool, opened };
}

describe('per-clinic connection caching', () => {
  it('opens one connection per clinic and reuses it', async () => {
    const { pool, opened } = poolWith([]);
    await pool.getClinicConnection('a', 'db_a');
    await pool.getClinicConnection('a', 'db_a');
    await pool.getClinicConnection('b', 'db_b');

    expect(opened).toHaveLength(2);
    expect(pool.stats().cached).toBe(2);
  });

  it('shares one handshake between concurrent requests for the same clinic', async () => {
    const { pool, opened } = poolWith([]);
    await Promise.all([
      pool.getClinicConnection('a', 'db_a'),
      pool.getClinicConnection('a', 'db_a'),
      pool.getClinicConnection('a', 'db_a'),
    ]);
    expect(opened).toHaveLength(1);
  });

  it('compiles the Outcome model bound to the clinic it opened', async () => {
    const { pool, opened } = poolWith([]);
    await pool.getClinicConnection('a', 'db_a');
    expect(opened[0].models.Outcome).toBeDefined();
  });
});

describe('a failed handshake is never left in the cache', () => {
  it('rethrows and evicts, so the next request retries', async () => {
    // The bug this replaced cached the rejected promise: one blip made a clinic
    // permanently unreachable until the process restarted.
    const failing = fakeConnection({ fail: true });
    const { pool, opened } = poolWith([failing, fakeConnection()]);

    await expect(pool.getClinicConnection('a', 'db_a')).rejects.toThrow('handshake failed');
    expect(pool.stats().cached).toBe(0);
    expect(failing.closed).toBe(1);

    await expect(pool.getClinicConnection('a', 'db_a')).resolves.toBeDefined();
    expect(opened).toHaveLength(2);
  });
});

describe('the cache is bounded', () => {
  it('evicts the least-recently-used clinic past the limit', async () => {
    const { pool, opened } = poolWith([], { maxConnections: 2 });

    await pool.getClinicConnection('a', 'db_a');
    await pool.getClinicConnection('b', 'db_b');
    // Touching "a" makes "b" the least recently used.
    await pool.getClinicConnection('a', 'db_a');
    await pool.getClinicConnection('c', 'db_c');

    expect(pool.stats()).toMatchObject({ cached: 2, maxConnections: 2, evictions: 1 });
    // The evicted connection is the one opened second, i.e. clinic "b".
    expect(opened[1].closed).toBe(1);
    expect(opened[0].closed).toBe(0);
  });

  it('reconnects a clinic that was evicted', async () => {
    const { pool, opened } = poolWith([], { maxConnections: 1 });
    await pool.getClinicConnection('a', 'db_a');
    await pool.getClinicConnection('b', 'db_b');
    await pool.getClinicConnection('a', 'db_a');
    expect(opened).toHaveLength(3);
  });

  it('closes everything on shutdown', async () => {
    const { pool, opened } = poolWith([], { maxConnections: 10 });
    await pool.getClinicConnection('a', 'db_a');
    await pool.getClinicConnection('b', 'db_b');
    await pool.closeAll();
    expect(opened.every((c) => c.closed === 1)).toBe(true);
    expect(pool.stats().cached).toBe(0);
  });
});

describe('configuration', () => {
  it('refuses to build a URI when no base URI is configured', async () => {
    const { pool } = poolWith([], { baseUri: '' });
    await expect(pool.getClinicConnection('a', 'db_a')).rejects.toThrow(/MONGODB_BASE_URI/);
  });

  it('applies bounded pool options to every clinic connection', async () => {
    const seen = [];
    const pool = createConnectionPool({
      baseUri: 'mongodb://fake',
      logger: silentLogger,
      poolSize: 3,
      maxIdleTimeMS: 1234,
      createConnection: (uri, opts) => {
        seen.push(opts);
        return fakeConnection();
      },
    });
    await pool.getClinicConnection('a', 'db_a');
    expect(seen[0]).toMatchObject({ maxPoolSize: 3, maxIdleTimeMS: 1234 });
  });
});
