'use strict';

const express = require('express');
const cors = require('cors');
const { buildContainer } = require('./container');
const { createOutcomeRouter } = require('./routes/outcomes');
const { allowedOrigins } = require('./cors');
const { HttpError } = require('./http/errors');
const { TenantScopeError } = require('./tenancy/tenantScope');

/**
 * @param {object} [overrides] dependency overrides, used by the test suites to
 *                             build the same graph with a stubbed AI provider.
 */
function createApp(overrides = {}) {
  const container = buildContainer(overrides);
  const app = express();

  app.set('container', container);
  app.use(cors({ origin: allowedOrigins(), credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/outcomes', createOutcomeRouter(container));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'outcome-service' });
  });

  app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
  });

  /**
   * The single place that decides what a client is told about a failure.
   *
   * Only errors that opt in (`HttpError`) reach the client with their own
   * message. Everything else becomes a flat 500, because an arbitrary error's
   * message is not safe to return here: a Mongoose validation or cast error
   * embeds the submitted document values, and in this service those values are
   * patient data. For the same reason the log line records the error's name and
   * message only - never the error object, never the request body.
   */
  app.use((err, req, res, _next) => {
    if (err instanceof TenantScopeError) {
      // Reaching here means a query tried to leave its clinic. That is a bug in
      // this service, not a client mistake, and it deserves a loud log line.
      console.error('TENANT SCOPE VIOLATION:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
      return;
    }

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
