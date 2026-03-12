'use strict';

const express = require('express');
const cors = require('cors');
const { buildContainer } = require('./container');
const { createAuthRouter } = require('./routes/auth');
const { allowedOrigins } = require('./cors');
const { HttpError } = require('./http/errors');

function createApp(overrides = {}) {
  const container = buildContainer(overrides);
  const app = express();

  app.set('container', container);
  app.use(cors({ origin: allowedOrigins(), credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/auth', createAuthRouter(container));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'auth-service' });
  });

  app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
  });

  /**
   * The single place that decides what a client is told about a failure. Only
   * errors that opt in (`HttpError`) reach the client with their own message;
   * everything else becomes a flat 500, because an arbitrary error's message
   * embeds the submitted document values. The log records the error's name and
   * message only - never the error object, never the request body.
   */
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      if (!res.headersSent) {
        res.status(err.status).json({
          success: false,
          message: err.message,
          ...(err.code ? { code: err.code } : {}),
        });
      }
      return;
    }

    console.error('Unhandled error:', err.name, err.message);
    if (res.headersSent) return;
    res.status(500).json({ success: false, message: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
