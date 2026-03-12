'use strict';

const { config } = require('./config');
const { createAuthService } = require('./services/authService');

/**
 * Composition root. Dependency arrows point inward: the router depends on the
 * service, the service depends on models and the tenancy pool, and nothing in
 * the inner layers imports Express or reads `process.env`.
 */
function buildContainer(overrides = {}) {
  const authService = overrides.authService || createAuthService({ config, ...overrides });
  return { config, authService };
}

module.exports = { buildContainer };
