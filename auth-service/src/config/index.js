'use strict';

/**
 * Single place where environment variables become typed configuration. Every
 * other module imports this object instead of reading `process.env` directly,
 * so the knobs this service exposes are greppable in one file and the parsing
 * rules are applied once.
 */

const REQUIRED_ENV = ['MONGODB_REGISTRY_URI', 'MONGODB_BASE_URI', 'JWT_SECRET'];

function readInt(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function readList(name) {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return null;
  if (raw.trim() === '*') return true;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function missingEnv() {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

function loadConfig() {
  return Object.freeze({
    port: readInt('PORT', 4001, { min: 1, max: 65535 }),
    registryUri: process.env.MONGODB_REGISTRY_URI || '',
    baseUri: process.env.MONGODB_BASE_URI || '',
    jwtSecret: process.env.JWT_SECRET || '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    corsOrigins: readList('CORS_ORIGIN'),

    tenancy: Object.freeze({
      // One database per clinic means one connection pool per clinic. Holding
      // an open pool for every clinic does not survive a four-digit clinic
      // count, so the cache is bounded and evicts least-recently-used clinics.
      maxCachedConnections: readInt('TENANT_MAX_CONNECTIONS', 50, { min: 1, max: 10000 }),
      poolSize: readInt('TENANT_POOL_SIZE', 5, { min: 1, max: 200 }),
      minPoolSize: readInt('TENANT_MIN_POOL_SIZE', 0, { min: 0, max: 200 }),
      maxIdleTimeMs: readInt('TENANT_POOL_MAX_IDLE_MS', 60_000, { min: 1000 }),
      serverSelectionTimeoutMs: readInt('MONGO_SERVER_SELECTION_TIMEOUT_MS', 5000, { min: 250 }),
      evictionDrainMs: readInt('TENANT_EVICTION_DRAIN_MS', 15_000, { min: 0 }),
    }),
  });
}

module.exports = { config: loadConfig(), loadConfig, missingEnv, REQUIRED_ENV };
