require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 4000;

const REQUIRED_ENV = ['AUTH_SERVICE_URL', 'OUTCOME_SERVICE_URL'];
const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length > 0) {
  // Without a target, http-proxy-middleware fails per-request with an opaque
  // error instead of telling the operator the gateway is misconfigured.
  console.error(`API Gateway: missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  : DEFAULT_ORIGINS;

app.use(cors({ origin: corsOrigin, credentials: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

// On a socket-level failure `res` may be a raw socket rather than an Express
// response, and the headers may already be on the wire. Both cases used to
// throw inside the error handler and take the connection down uncleanly.
function proxyErrorHandler(label, message) {
  return (err, req, res) => {
    console.error(`${label} proxy error:`, err.message);
    if (!res || res.headersSent || typeof res.status !== 'function') {
      if (res && typeof res.destroy === 'function') res.destroy();
      return;
    }
    res.status(502).json({ success: false, message });
  };
}

const authProxy = createProxyMiddleware({
  target: process.env.AUTH_SERVICE_URL,
  changeOrigin: true,
  pathFilter: '/api/auth',
  on: { error: proxyErrorHandler('Auth', 'Auth service is unavailable') },
});

const outcomeProxy = createProxyMiddleware({
  target: process.env.OUTCOME_SERVICE_URL,
  changeOrigin: true,
  pathFilter: '/api/outcomes',
  on: { error: proxyErrorHandler('Outcome', 'Outcome service is unavailable') },
});

app.use(authProxy);
app.use(outcomeProxy);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`  Auth Service    -> ${process.env.AUTH_SERVICE_URL}`);
  console.log(`  Outcome Service -> ${process.env.OUTCOME_SERVICE_URL}`);
});
