'use strict';

/**
 * Single place where environment variables become typed configuration.
 *
 * Every other module imports this object instead of reading `process.env`
 * directly, so the set of knobs the service exposes is greppable in one file
 * and the parsing/clamping rules are applied once.
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
  const apiKey = process.env.ANTHROPIC_API_KEY || '';

  return Object.freeze({
    port: readInt('PORT', 4002, { min: 1, max: 65535 }),
    registryUri: process.env.MONGODB_REGISTRY_URI || '',
    baseUri: process.env.MONGODB_BASE_URI || '',
    jwtSecret: process.env.JWT_SECRET || '',
    corsOrigins: readList('CORS_ORIGIN'),

    pagination: Object.freeze({
      defaultPageSize: readInt('PAGE_SIZE_DEFAULT', 20, { min: 1, max: 500 }),
      maxPageSize: readInt('PAGE_SIZE_MAX', 100, { min: 1, max: 500 }),
    }),

    tenancy: Object.freeze({
      // A per-clinic database means a per-clinic connection pool. Holding one
      // open pool per clinic does not survive a four-digit clinic count, so the
      // cache is bounded and evicts least-recently-used clinics.
      maxCachedConnections: readInt('TENANT_MAX_CONNECTIONS', 50, { min: 1, max: 10000 }),
      poolSize: readInt('TENANT_POOL_SIZE', 5, { min: 1, max: 200 }),
      minPoolSize: readInt('TENANT_MIN_POOL_SIZE', 0, { min: 0, max: 200 }),
      maxIdleTimeMs: readInt('TENANT_POOL_MAX_IDLE_MS', 60_000, { min: 1000 }),
      serverSelectionTimeoutMs: readInt('MONGO_SERVER_SELECTION_TIMEOUT_MS', 5000, { min: 250 }),
      // An evicted connection is dropped from the cache immediately but closed
      // only after this delay, so in-flight queries are allowed to finish.
      evictionDrainMs: readInt('TENANT_EVICTION_DRAIN_MS', 15_000, { min: 0 }),
      clinicCacheTtlMs: readInt('CLINIC_CACHE_TTL_MS', 30_000, { min: 0 }),
      clinicCacheMax: readInt('CLINIC_CACHE_MAX', 1000, { min: 1 }),
    }),

    insights: Object.freeze({
      // Small-cell suppression: a group smaller than this is folded into
      // "other" before anything leaves the service, so a cohort summary cannot
      // narrow down to one patient.
      minGroupSize: readInt('INSIGHT_MIN_GROUP_SIZE', 5, { min: 1, max: 100 }),
      windowMonths: readInt('INSIGHT_WINDOW_MONTHS', 12, { min: 1, max: 120 }),
      maxDiagnosisGroups: readInt('INSIGHT_MAX_GROUPS', 8, { min: 1, max: 50 }),
    }),

    ai: Object.freeze({
      enabled: Boolean(apiKey),
      apiKey,
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
      maxTokens: readInt('ANTHROPIC_MAX_TOKENS', 4000, { min: 512, max: 64_000 }),
      effort: process.env.ANTHROPIC_EFFORT || 'low',
      timeoutMs: readInt('ANTHROPIC_TIMEOUT_MS', 30_000, { min: 1000 }),
    }),

    metricDefinitionsPath: process.env.METRIC_DEFINITIONS_PATH || null,
  });
}

module.exports = { config: loadConfig(), loadConfig, missingEnv, REQUIRED_ENV };
