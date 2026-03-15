'use strict';

const { OUTCOME_VALUES } = require('../schemas/outcome');
const { parsePagination, paginationMeta } = require('../http/pagination');
const { outcomeTrend, diagnosisCohorts } = require('../insights/analytics');
const { buildBriefing } = require('../ai/briefing');

/**
 * All outcome business logic, expressed against a tenant context.
 *
 * Nothing in here reads `req`, writes `res` or reaches for `process.env`, and
 * nothing in here opens a database connection - it is handed a tenant whose
 * models are already bound to one clinic. The routes above are argument
 * marshalling and status codes; the tenancy layer below is connections and
 * scoping. This is the only layer that knows what an outcome *means*.
 */
function createOutcomeService(dependencies) {
  const { resolveTenantContext, metrics, summaryProvider, config } = dependencies;

  async function listOutcomes(clinicId, query = {}) {
    const { models } = await resolveTenantContext(clinicId);
    const filter = {};
    if (typeof query.outcome === 'string' && OUTCOME_VALUES.includes(query.outcome)) {
      filter.outcome = query.outcome;
    }

    const page = parsePagination(query, config.pagination);
    // `lean()` skips hydrating a Mongoose document per row. On a listing that
    // is only serialised straight back out, hydration is the dominant cost.
    const [outcomes, total] = await Promise.all([
      models.Outcome.find(filter)
        .sort({ recordedAt: -1, _id: -1 })
        .skip(page.skip)
        .limit(page.limit)
        .lean(),
      models.Outcome.countDocuments(filter),
    ]);

    return { outcomes, pagination: paginationMeta(page, total) };
  }

  async function createOutcome(clinicId, input, actor) {
    const { models } = await resolveTenantContext(clinicId);
    // Throws BadRequestError naming the metric, never echoing its value.
    const measures = metrics.validateMeasures(input.measures);

    const created = await models.Outcome.create({
      // clinicId and createdBy come from the verified token, never the body.
      clinicId,
      patientName: input.patientName,
      age: input.age,
      diagnosis: input.diagnosis,
      treatment: input.treatment,
      outcome: input.outcome,
      recordedAt: input.recordedAt ? new Date(input.recordedAt) : undefined,
      measures,
      notes: input.notes,
      createdBy: actor.username,
    });

    return created;
  }

  async function getStats(clinicId) {
    const { models } = await resolveTenantContext(clinicId);
    const rows = await models.Outcome.aggregate([
      { $group: { _id: '$outcome', count: { $sum: 1 } } },
    ]);

    const result = OUTCOME_VALUES.reduce((acc, value) => ({ ...acc, [value]: 0 }), {});
    let total = 0;
    rows.forEach((row) => {
      // Guard against a legacy or unexpected `outcome` value injecting an extra
      // key into the response while still counting toward the total.
      if (OUTCOME_VALUES.includes(row._id)) result[row._id] = row.count;
      total += row.count;
    });
    result.total = total;
    return result;
  }

  async function getTrends(clinicId, query = {}) {
    const { models } = await resolveTenantContext(clinicId);
    const requested = Number.parseInt(query.months, 10);
    const windowMonths =
      Number.isFinite(requested) && requested > 0
        ? Math.min(requested, 60)
        : config.insights.windowMonths;
    return outcomeTrend(models.Outcome, { windowMonths, metrics });
  }

  async function getCohorts(clinicId) {
    const { models } = await resolveTenantContext(clinicId);
    return diagnosisCohorts(models.Outcome, {
      minGroupSize: config.insights.minGroupSize,
      maxGroups: config.insights.maxDiagnosisGroups,
    });
  }

  /**
   * Outcome summarisation for a clinician.
   *
   * Returns the summary *and* the exact briefing it was written from, because a
   * clinical decision-support answer whose inputs you cannot inspect is not
   * decision support - it is an oracle.
   */
  async function getInsights(clinicId, query = {}) {
    const tenant = await resolveTenantContext(clinicId);
    const [stats, trend, cohorts] = await Promise.all([
      getStats(clinicId),
      getTrends(clinicId, query),
      getCohorts(clinicId),
    ]);

    const briefing = buildBriefing({
      clinicName: tenant.clinicName,
      stats,
      trend,
      cohorts,
    });

    const summary = await summaryProvider.summarise(briefing);

    return {
      summary,
      briefing,
      disclaimer:
        'Decision support only. These are clinic-level counts, not a diagnosis, ' +
        'and no statement here describes an individual patient.',
    };
  }

  function listMetrics() {
    return metrics.list();
  }

  return {
    listOutcomes,
    createOutcome,
    getStats,
    getTrends,
    getCohorts,
    getInsights,
    listMetrics,
  };
}

module.exports = { createOutcomeService };
