'use strict';

const { config } = require('./config');
const { createMetricRegistry } = require('./metrics/registry');
const { createSummaryProvider } = require('./ai/provider');
const { resolveTenantContext } = require('./tenancy/tenantContext');
const { createOutcomeService } = require('./services/outcomeService');

/**
 * Composition root.
 *
 * Every dependency arrow in this service points inward: routes depend on the
 * service, the service depends on the tenancy and metric abstractions, and
 * nothing in the inner layers imports Express or reads `process.env`. This file
 * is the one place where the concrete implementations are chosen, which is why
 * a test can build the same object graph with a stub provider and never touch
 * the network.
 */
function buildContainer(overrides = {}) {
  const metrics =
    overrides.metrics ||
    createMetricRegistry({ definitionsPath: config.metricDefinitionsPath });

  const summaryProvider =
    overrides.summaryProvider || createSummaryProvider(config.ai, overrides.aiDeps);

  const outcomeService = createOutcomeService({
    resolveTenantContext: overrides.resolveTenantContext || resolveTenantContext,
    metrics,
    summaryProvider,
    config: overrides.config || config,
  });

  return { config, metrics, summaryProvider, outcomeService };
}

module.exports = { buildContainer };
