'use strict';

const { config } = require('../config');
const Clinic = require('../models/Clinic');
const { ClinicAccessError } = require('../http/errors');

/**
 * Resolves a clinic id from the registry.
 *
 * This runs on every authenticated request, so an uncached implementation puts
 * one registry round trip in front of every read. The result is cached for a
 * short TTL, including the "no such clinic" answer, which stops an invalid or
 * forged clinic id from being a free way to hammer the registry.
 *
 * The cost is honest and bounded: deactivating a clinic takes effect within the
 * TTL rather than instantly. Set `CLINIC_CACHE_TTL_MS=0` to make revocation
 * immediate at the price of that extra query per request.
 */
function createClinicDirectory(options = {}) {
  const {
    ttlMs = config.tenancy.clinicCacheTtlMs,
    maxEntries = config.tenancy.clinicCacheMax,
    model = Clinic,
    now = () => Date.now(),
  } = options;

  /** clinicId -> { clinic: doc|null, expiresAt } */
  const cache = new Map();
  let hits = 0;
  let misses = 0;

  function remember(clinicId, clinic) {
    if (ttlMs <= 0) return;
    cache.delete(clinicId);
    cache.set(clinicId, { clinic, expiresAt: now() + ttlMs });
    while (cache.size > maxEntries) {
      cache.delete(cache.keys().next().value);
    }
  }

  function cached(clinicId) {
    if (ttlMs <= 0) return undefined;
    const entry = cache.get(clinicId);
    if (!entry) return undefined;
    if (entry.expiresAt <= now()) {
      cache.delete(clinicId);
      return undefined;
    }
    return entry;
  }

  /**
   * @returns {Promise<{clinicId: string, name: string, dbName: string}>}
   * @throws {ClinicAccessError} when the clinic is unknown or deactivated.
   */
  async function requireActiveClinic(clinicId) {
    const entry = cached(clinicId);
    let clinic;
    if (entry) {
      hits += 1;
      clinic = entry.clinic;
    } else {
      misses += 1;
      const doc = await model.findOne({ clinicId }).select('clinicId name dbName isActive').lean();
      clinic = doc || null;
      remember(clinicId, clinic);
    }

    // An unknown clinic is an authorization failure, not a server fault, and
    // the reply must not confirm whether that clinic id exists.
    if (!clinic) {
      throw new ClinicAccessError('Access to this clinic is not permitted', 'clinic_not_found');
    }
    if (!clinic.isActive) {
      // Login already blocks inactive clinics, but tokens issued before the
      // deactivation stay valid until they expire, so this has to be re-checked
      // on every data request rather than only at login.
      throw new ClinicAccessError('Clinic account is inactive. Contact support.', 'clinic_inactive');
    }
    return clinic;
  }

  function invalidate(clinicId) {
    if (clinicId === undefined) cache.clear();
    else cache.delete(clinicId);
  }

  function stats() {
    return { size: cache.size, hits, misses, ttlMs, maxEntries };
  }

  return { requireActiveClinic, invalidate, stats };
}

const defaultDirectory = createClinicDirectory();

module.exports = {
  createClinicDirectory,
  requireActiveClinic: defaultDirectory.requireActiveClinic,
  invalidate: defaultDirectory.invalidate,
  stats: defaultDirectory.stats,
};
