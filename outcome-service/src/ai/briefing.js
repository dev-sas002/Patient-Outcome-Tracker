'use strict';

/**
 * The briefing is the ONLY thing an AI provider is ever given.
 *
 * It is assembled here, from aggregates that have already been through
 * small-cell suppression, and it deliberately contains no patient name, no age,
 * no free-text note and no individual record. A clinic name and counts are the
 * whole of it. That is what makes it safe to hand to a third-party model, and
 * it is also what the API returns to the caller alongside the summary, so a
 * clinician can see exactly what the summary was written from.
 *
 * `assertAggregateOnly` is a belt-and-braces check rather than documentation:
 * if somebody later widens the briefing to include a record, the call fails
 * loudly instead of quietly shipping PHI to an external API.
 */

const FORBIDDEN_KEYS = ['patientName', 'notes', 'age', 'createdBy', '_id', 'diagnosisText'];

function assertAggregateOnly(value, path = 'briefing') {
  if (Array.isArray(value)) {
    value.forEach((entry, i) => assertAggregateOnly(entry, `${path}[${i}]`));
    return value;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(key)) {
        throw new Error(`Refusing to build an AI briefing containing "${key}" at ${path}`);
      }
      assertAggregateOnly(child, `${path}.${key}`);
    }
  }
  return value;
}

/**
 * @param {object} parts
 * @param {string} parts.clinicName
 * @param {object} parts.stats   outcome counts for the whole clinic
 * @param {object} parts.trend   output of insights/analytics#outcomeTrend
 * @param {object} parts.cohorts output of insights/analytics#diagnosisCohorts
 */
function buildBriefing({ clinicName, stats, trend, cohorts }) {
  const months = trend.months.filter((m) => m.total > 0);
  const first = months[0] || null;
  const last = months[months.length - 1] || null;

  const briefing = {
    clinic: clinicName,
    generatedAt: new Date().toISOString(),
    windowMonths: trend.windowMonths,
    totals: {
      records: stats.total,
      improved: stats.improved,
      stable: stats.stable,
      declined: stats.declined,
      improvedRate: stats.total ? Number((stats.improved / stats.total).toFixed(3)) : 0,
      declinedRate: stats.total ? Number((stats.declined / stats.total).toFixed(3)) : 0,
    },
    monthsWithRecords: months.length,
    recordingWindow: first && last ? { from: first.month, to: last.month } : null,
    monthlyOutcomes: trend.months,
    measureTrends: trend.measures.map((series) => ({
      metricId: series.metricId,
      label: series.label,
      unit: series.unit,
      direction: series.direction,
      change: series.change,
      observations: series.observations,
    })),
    diagnosisCohorts: cohorts.cohorts,
    suppression: {
      minGroupSize: cohorts.minGroupSize,
      suppressedGroups: cohorts.suppressedGroups,
    },
  };

  return assertAggregateOnly(briefing);
}

module.exports = { buildBriefing, assertAggregateOnly, FORBIDDEN_KEYS };
