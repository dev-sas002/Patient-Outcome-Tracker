'use strict';

const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { rateLimit } = require('express-rate-limit');

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

/**
 * The gateway is the only hop that sees the browser's address (the services
 * behind it see the gateway), so per-client login throttling lives here.
 */
function createGateway({ authServiceUrl, outcomeServiceUrl, corsOrigins, loginLimit }) {
  const app = express();

  app.use(cors({ origin: corsOrigins, credentials: true }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'api-gateway' });
  });

  app.post(
    '/api/auth/login',
    rateLimit({
      windowMs: loginLimit.windowMs,
      limit: loginLimit.max,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        success: false,
        message: 'Too many sign-in attempts. Wait a few minutes and try again.',
      },
    })
  );

  app.use(
    createProxyMiddleware({
      target: authServiceUrl,
      changeOrigin: true,
      pathFilter: '/api/auth',
      on: { error: proxyErrorHandler('Auth', 'Auth service is unavailable') },
    })
  );

  app.use(
    createProxyMiddleware({
      target: outcomeServiceUrl,
      changeOrigin: true,
      pathFilter: '/api/outcomes',
      on: { error: proxyErrorHandler('Outcome', 'Outcome service is unavailable') },
    })
  );

  app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
  });

  return app;
}

module.exports = { createGateway };
