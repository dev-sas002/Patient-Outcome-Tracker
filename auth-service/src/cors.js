'use strict';

const { config } = require('./config');

const DEFAULT_ORIGINS = Object.freeze([
  'http://localhost:3000',
  'http://localhost:4000',
  'http://localhost:5173',
]);

/**
 * Backend services sit behind the API gateway and are never called directly by
 * a browser in normal operation. Defaulting to a closed allow-list (instead of
 * the wide-open `cors()`) stops an arbitrary origin from driving these services
 * when they are reachable on localhost. Override with CORS_ORIGIN, comma
 * separated, or `*` to allow any origin.
 */
function allowedOrigins() {
  const configured = config.corsOrigins;
  if (configured === null) return DEFAULT_ORIGINS;
  return configured;
}

module.exports = { allowedOrigins, DEFAULT_ORIGINS };
