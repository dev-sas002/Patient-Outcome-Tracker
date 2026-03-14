'use strict';

const { OUTCOME_VALUES } = require('../schemas/outcome');

/**
 * Clinic-level aggregates, computed in MongoDB rather than in Node.
 *
 * Everything here runs through a tenant-bound model, so the aggregation
 * pipelines below are rewritten with a `$match` on the caller's clinic as stage
 * zero before they reach the server (see `tenancy/tenantScope`). None of these
 * functions can see across clinics even if the pipeline forgets to say so.
 *
 * Two privacy rules are enforced here and not left to the caller:
 *
 *  - nothing returned identifies a patient - these are counts and averages
 *    only, never rows;
 *  - any group smaller than `minGroupSize` is suppressed and folded into an
 *    "other" bucket, so a cohort breakdown cannot be narrowed down to a single
 *    person by filtering. A count of one is an identifier.
 */

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function emptyOutcomeCounts() {
  return OUTCOME_VALUES.reduce((acc, value) => ({ ...acc, [value]: 0 }), {});
}

function monthKeysBack(months, now) {
  const keys = [];
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

/**
 * Outcome counts per calendar month over a trailing window, plus the mean of
 * every measure recorded in that month.
 *
 * Buckets with no records are returned as explicit zeroes rather than omitted,
 * so a chart shows a gap in recording as a gap instead of silently closing it.
 */
async function outcomeTrend(Outcome, { windowMonths, metrics, now = new Date() }) {
  const since = new Date(now.getTime() - windowMonths * MONTH_MS);

  const rows = await Outcome.aggregate([
    { $match: { recordedAt: { $gte: since } } },
    {
      $group: {
        _id: {
          month: { $dateToString: { format: '%Y-%m', date: '$recordedAt' } },
          outcome: '$outcome',
        },
        count: { $sum: 1 },
        measures: { $push: '$measures' },
      },
    },
    { $sort: { '_id.month': 1 } },
  ]);

  const buckets = new Map(
    monthKeysBack(windowMonths, now).map((month) => [
      month,
      { month, total: 0, ...emptyOutcomeCounts() },
    ])
  );

  /** metricId -> month -> { sum, n } */
  const measureTotals = new Map();

  rows.forEach((row) => {
    const { month, outcome } = row._id;
    if (!buckets.has(month)) {
      buckets.set(month, { month, total: 0, ...emptyOutcomeCounts() });
    }
    const bucket = buckets.get(month);
    if (OUTCOME_VALUES.includes(outcome)) bucket[outcome] += row.count;
    bucket.total += row.count;

    (row.measures || []).forEach((measureMap) => {
      if (!measureMap) return;
      // Mongoose returns a Map for a Map-typed path and a plain object from
      // an aggregation, depending on the driver path taken. Normalise both.
      const entries = measureMap instanceof Map ? [...measureMap] : Object.entries(measureMap);
      entries.forEach(([metricId, value]) => {
        if (!metrics.has(metricId) || !Number.isFinite(value)) return;
        if (!measureTotals.has(metricId)) measureTotals.set(metricId, new Map());
        const perMonth = measureTotals.get(metricId);
        const acc = perMonth.get(month) || { sum: 0, n: 0 };
        perMonth.set(month, { sum: acc.sum + value, n: acc.n + 1 });
      });
    });
  });

  const months = [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));

  const measureSeries = [...measureTotals.entries()].map(([metricId, perMonth]) => {
    const definition = metrics.get(metricId);
    const points = months.map(({ month }) => {
      const acc = perMonth.get(month);
      return { month, mean: acc ? Number((acc.sum / acc.n).toFixed(2)) : null, n: acc ? acc.n : 0 };
    });
    const observed = points.filter((p) => p.mean !== null);
    const first = observed[0];
    const last = observed[observed.length - 1];
    return {
      metricId,
      label: definition.label,
      observations: observed.reduce((sum, p) => sum + p.n, 0),
      unit: definition.unit || null,
      direction: definition.direction,
      points,
      change:
        first && last && first !== last
          ? {
              from: first.mean,
              to: last.mean,
              delta: Number((last.mean - first.mean).toFixed(2)),
              improving: metrics.isImprovement(metricId, first.mean, last.mean),
            }
          : null,
    };
  });

  // Ranked by how many observations back them: a measure recorded three times
  // should not lead a dashboard over one recorded thirty times.
  measureSeries.sort((a, b) => b.observations - a.observations);

  return { windowMonths, months, measures: measureSeries };
}

/**
 * Outcome breakdown by diagnosis, largest cohort first, with small cohorts
 * suppressed into a single "other" row.
 */
async function diagnosisCohorts(Outcome, { minGroupSize, maxGroups }) {
  const rows = await Outcome.aggregate([
    {
      $group: {
        _id: { diagnosis: '$diagnosis', outcome: '$outcome' },
        count: { $sum: 1 },
      },
    },
  ]);

  const byDiagnosis = new Map();
  rows.forEach((row) => {
    const { diagnosis, outcome } = row._id;
    if (!byDiagnosis.has(diagnosis)) {
      byDiagnosis.set(diagnosis, { diagnosis, total: 0, ...emptyOutcomeCounts() });
    }
    const entry = byDiagnosis.get(diagnosis);
    if (OUTCOME_VALUES.includes(outcome)) entry[outcome] += row.count;
    entry.total += row.count;
  });

  const ranked = [...byDiagnosis.values()].sort((a, b) => b.total - a.total);
  const reportable = ranked.filter((entry) => entry.total >= minGroupSize);
  const suppressed = ranked.filter((entry) => entry.total < minGroupSize);
  const kept = reportable.slice(0, maxGroups);
  const overflow = reportable.slice(maxGroups);

  const folded = [...suppressed, ...overflow];
  const other = folded.reduce(
    (acc, entry) => {
      acc.total += entry.total;
      OUTCOME_VALUES.forEach((value) => {
        acc[value] += entry[value];
      });
      return acc;
    },
    { diagnosis: 'Other (grouped)', total: 0, ...emptyOutcomeCounts() }
  );

  const cohorts = kept.map((entry) => ({
    ...entry,
    improvedRate: entry.total ? Number((entry.improved / entry.total).toFixed(3)) : 0,
  }));

  if (other.total > 0) {
    cohorts.push({
      ...other,
      improvedRate: Number((other.improved / other.total).toFixed(3)),
      grouped: true,
      groupedFrom: folded.length,
    });
  }

  return {
    minGroupSize,
    cohorts,
    suppressedGroups: suppressed.length,
    note:
      suppressed.length > 0
        ? `${suppressed.length} diagnosis group(s) with fewer than ${minGroupSize} records were folded into "Other (grouped)" so no row can describe a single patient.`
        : null,
  };
}

module.exports = { outcomeTrend, diagnosisCohorts, monthKeysBack, MONTH_MS };
