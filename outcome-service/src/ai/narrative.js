'use strict';

/**
 * The deterministic summary.
 *
 * This is not a placeholder for the AI path - it is the floor underneath it.
 * With no API key configured the endpoint still returns something a clinician
 * can read, computed from the same briefing, and every AI failure (missing key,
 * timeout, rate limit, a refusal) falls back to it rather than to an error.
 * The feature therefore has no "AI is down" state.
 */

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

function summariseBriefing(briefing) {
  const { totals, recordingWindow, windowMonths, measureTrends, diagnosisCohorts } = briefing;
  const points = [];

  if (totals.records === 0) {
    return {
      headline: 'No outcome records yet',
      points: ['Record an outcome to start building a trend for this clinic.'],
    };
  }

  points.push(
    `${totals.records} recorded outcomes: ${totals.improved} improved, ` +
      `${totals.stable} stable, ${totals.declined} declined (${pct(totals.improvedRate)} improved).`
  );

  if (recordingWindow) {
    points.push(
      `Records span ${recordingWindow.from} to ${recordingWindow.to} within the last ` +
        `${windowMonths} months, across ${briefing.monthsWithRecords} month(s) of activity.`
    );
  }

  // The two best-evidenced measures, not the two that moved most: a delta in
  // metres and a delta in PHQ-9 points are not comparable magnitudes, so
  // ranking by size would reliably promote whichever measure has the widest
  // scale. The series arrive sorted by observation count.
  measureTrends
    .filter((series) => series.change)
    .slice(0, 2)
    .forEach((series) => {
      const direction = series.change.improving
        ? 'moved in the expected direction'
        : 'moved against the expected direction';
      const unit = series.unit ? ` (${series.unit})` : '';
      points.push(
        `${series.label} ${direction}: ${series.change.from} to ${series.change.to}${unit}, ` +
          `from ${series.observations} observations.`
      );
    });

  const worst = [...diagnosisCohorts]
    .filter((c) => !c.grouped && c.total > 0)
    .sort((a, b) => a.improvedRate - b.improvedRate)[0];
  if (worst) {
    points.push(
      `Lowest improvement rate is ${worst.diagnosis} at ${pct(worst.improvedRate)} ` +
        `across ${worst.total} records.`
    );
  }

  if (briefing.suppression.suppressedGroups > 0) {
    points.push(
      `${briefing.suppression.suppressedGroups} diagnosis group(s) had fewer than ` +
        `${briefing.suppression.minGroupSize} records and were grouped rather than reported separately.`
    );
  }

  const headline =
    totals.declinedRate > 0.25
      ? 'Declined outcomes are above a quarter of records'
      : totals.improvedRate >= 0.5
        ? 'Most recorded outcomes improved'
        : 'Mixed outcomes across the recording window';

  // Five points is the ceiling: past that nobody reads to the end.
  return { headline, points: points.slice(0, 5) };
}

module.exports = { summariseBriefing };
