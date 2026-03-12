'use strict';

require('dotenv').config();
const { createGateway } = require('./app');

const REQUIRED_ENV = ['AUTH_SERVICE_URL', 'OUTCOME_SERVICE_URL'];
const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length > 0) {
  // Without a target, http-proxy-middleware fails per-request with an opaque
  // error instead of telling the operator the gateway is misconfigured.
  console.error(`API Gateway: missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

function readPositiveInt(name, fallback) {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  : DEFAULT_ORIGINS;

const PORT = readPositiveInt('PORT', 4000);

const app = createGateway({
  authServiceUrl: process.env.AUTH_SERVICE_URL,
  outcomeServiceUrl: process.env.OUTCOME_SERVICE_URL,
  corsOrigins,
  loginLimit: {
    max: readPositiveInt('LOGIN_RATE_LIMIT', 10),
    windowMs: readPositiveInt('LOGIN_RATE_WINDOW_MS', 15 * 60 * 1000),
  },
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`  Auth Service    -> ${process.env.AUTH_SERVICE_URL}`);
  console.log(`  Outcome Service -> ${process.env.OUTCOME_SERVICE_URL}`);
});
