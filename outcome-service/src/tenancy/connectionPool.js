'use strict';

const mongoose = require('mongoose');
const { config } = require('../config');
const { getTenantOutcomeSchema } = require('../schemas/outcome');

/**
 * One MongoDB database per clinic means one connection pool per clinic. That is
 * fine at ten clinics and fatal at a thousand: each pool holds sockets open
 * against the server and each open socket is a file descriptor here and a
 * connection slot there.
 *
 * So the cache is bounded and least-recently-used. An evicted clinic is dropped
 * from the map straight away and its connection closed only after a drain
 * delay, which lets queries already in flight finish rather than failing
 * mid-request. A clinic that comes back after eviction simply reconnects.
 *
 * A failed handshake is never left in the cache - the bug this replaced cached
 * the rejected promise, so one blip made a clinic permanently unreachable.
 */
function createConnectionPool(options = {}) {
  const {
    baseUri = () => config.baseUri,
    maxConnections = config.tenancy.maxCachedConnections,
    poolSize = config.tenancy.poolSize,
    minPoolSize = config.tenancy.minPoolSize,
    maxIdleTimeMS = config.tenancy.maxIdleTimeMs,
    serverSelectionTimeoutMS = config.tenancy.serverSelectionTimeoutMs,
    evictionDrainMs = config.tenancy.evictionDrainMs,
    createConnection = (uri, opts) => mongoose.createConnection(uri, opts),
    logger = console,
  } = options;

  const resolveBaseUri = typeof baseUri === 'function' ? baseUri : () => baseUri;

  /** clinicId -> { promise, connection, lastUsedAt } */
  const entries = new Map();
  const drainTimers = new Set();
  let evictions = 0;

  function touch(clinicId, entry) {
    // Map preserves insertion order, so re-inserting moves an entry to the
    // most-recently-used end and the first key is always the LRU victim.
    entries.delete(clinicId);
    entry.lastUsedAt = Date.now();
    entries.set(clinicId, entry);
  }

  function scheduleClose(clinicId, entry) {
    const close = async () => {
      const conn = await entry.promise.catch(() => null);
      if (conn) await conn.close().catch(() => {});
      logger.log(`Outcome Service: closed pooled connection for ${clinicId}`);
    };
    if (evictionDrainMs === 0) return close();
    const timer = setTimeout(() => {
      drainTimers.delete(timer);
      close();
    }, evictionDrainMs);
    if (typeof timer.unref === 'function') timer.unref();
    drainTimers.add(timer);
    return undefined;
  }

  function evictIfOverCapacity() {
    while (entries.size > maxConnections) {
      const [clinicId, entry] = entries.entries().next().value;
      entries.delete(clinicId);
      evictions += 1;
      logger.log(
        `Outcome Service: evicting least-recently-used clinic connection ${clinicId} ` +
          `(cache limit ${maxConnections})`
      );
      scheduleClose(clinicId, entry);
    }
  }

  async function getClinicConnection(clinicId, dbName) {
    const cached = entries.get(clinicId);
    if (cached) {
      touch(clinicId, cached);
      return cached.promise;
    }

    const uri = resolveBaseUri();
    if (!uri) throw new Error('MONGODB_BASE_URI is not configured');

    const conn = createConnection(`${uri}/${dbName}`, {
      maxPoolSize: poolSize,
      minPoolSize,
      maxIdleTimeMS,
      serverSelectionTimeoutMS,
    });
    conn.model('Outcome', getTenantOutcomeSchema(clinicId));

    // Cache the pending connection so concurrent requests for the same clinic
    // share one handshake instead of opening a pool each. The cached promise
    // gets its own no-op catch: without one, a failed handshake rejects a
    // promise nobody is awaiting yet and takes the process down with an
    // unhandled rejection. The failure is still surfaced, by the await below.
    const pending = conn.asPromise().then(() => conn);
    pending.catch(() => {});

    const entry = { promise: pending, lastUsedAt: Date.now() };
    entries.set(clinicId, entry);
    evictIfOverCapacity();

    try {
      await pending;
    } catch (error) {
      entries.delete(clinicId);
      await conn.close().catch(() => {});
      throw error;
    }

    logger.log(`Outcome Service: connected to clinic DB "${dbName}" for ${clinicId}`);
    return conn;
  }

  function getClinicOutcomeModel(conn) {
    return conn.model('Outcome');
  }

  function stats() {
    return { cached: entries.size, maxConnections, evictions };
  }

  async function closeAll() {
    for (const timer of drainTimers) clearTimeout(timer);
    drainTimers.clear();
    for (const [, entry] of entries) {
      const conn = await entry.promise.catch(() => null);
      if (conn) await conn.close().catch(() => {});
    }
    entries.clear();
  }

  return { getClinicConnection, getClinicOutcomeModel, stats, closeAll };
}

const defaultPool = createConnectionPool();

module.exports = {
  createConnectionPool,
  getClinicConnection: defaultPool.getClinicConnection,
  getClinicOutcomeModel: defaultPool.getClinicOutcomeModel,
  closeAll: defaultPool.closeAll,
  stats: defaultPool.stats,
};
