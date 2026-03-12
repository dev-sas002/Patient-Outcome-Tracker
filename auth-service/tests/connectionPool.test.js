const { configureEnv } = require('./helpers/testEnv');

configureEnv('authconnpool');

const { createConnectionPool } = require('../src/tenancy/connectionPool');

const silentLogger = { log: () => {}, error: () => {} };

function fakeConnection({ fail = false } = {}) {
  const conn = {
    closed: 0,
    models: {},
    model(name, schema) {
      if (schema) conn.models[name] = { name };
      return conn.models[name];
    },
    asPromise: () => (fail ? Promise.reject(new Error('handshake failed')) : Promise.resolve(conn)),
    close: async () => {
      conn.closed += 1;
    },
  };
  return conn;
}

function poolWith(queued, options = {}) {
  const opened = [];
  const pool = createConnectionPool({
    baseUri: 'mongodb://fake',
    logger: silentLogger,
    evictionDrainMs: 0,
    createConnection: () => {
      const conn = queued.shift() || fakeConnection();
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
  });

  it('shares one handshake between concurrent logins for the same clinic', async () => {
    const { pool, opened } = poolWith([]);
    await Promise.all([
      pool.getClinicConnection('a', 'db_a'),
      pool.getClinicConnection('a', 'db_a'),
    ]);
    expect(opened).toHaveLength(1);
  });

  it('binds the User model on the connection it opens', async () => {
    const { pool, opened } = poolWith([]);
    await pool.getClinicConnection('a', 'db_a');
    expect(opened[0].models.User).toBeDefined();
  });
});

describe('a failed handshake is never left in the cache', () => {
  it('rethrows and evicts, so the next login retries instead of reusing a dead pool', async () => {
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
    await pool.getClinicConnection('a', 'db_a');
    await pool.getClinicConnection('c', 'db_c');

    expect(pool.stats()).toMatchObject({ cached: 2, evictions: 1 });
    expect(opened[1].closed).toBe(1);
  });

  it('closes everything on shutdown', async () => {
    const { pool, opened } = poolWith([], { maxConnections: 10 });
    await pool.getClinicConnection('a', 'db_a');
    await pool.getClinicConnection('b', 'db_b');
    await pool.closeAll();
    expect(opened.every((c) => c.closed === 1)).toBe(true);
  });
});
