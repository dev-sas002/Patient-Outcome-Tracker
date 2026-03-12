const { configureEnv, dropAll } = require('./helpers/testEnv');

const NAMESPACE = 'trendwindow';
configureEnv(NAMESPACE);

const mongoose = require('mongoose');
const { getClinicConnection, getClinicOutcomeModel, closeAll } = require('../src/tenancy/connectionPool');
const { outcomeTrend, monthKeysBack } = require('../src/insights/analytics');
const { createMetricRegistry } = require('../src/metrics/registry');
const { outcomeFixture } = require('./helpers/fixtures');

const CLINIC = 'test-clinic-alpha';
// A fixed clock, early in a month, so a rolling 30-day cutoff and a calendar
// cutoff disagree about the previous November.
const NOW = new Date(Date.UTC(2026, 10, 7, 9));

let Outcome;
const metrics = createMetricRegistry();

function at(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day, 12));
}

beforeAll(async () => {
  Outcome = getClinicOutcomeModel(await getClinicConnection(CLINIC, `${NAMESPACE}_alpha`));
  await Outcome.deleteMany({});
  await Outcome.insertMany([
    // Inside a 360-day rolling window, outside the twelve calendar months.
    outcomeFixture(CLINIC, 0, { outcome: 'declined', recordedAt: at(2025, 10, 20) }),
    outcomeFixture(CLINIC, 1, { outcome: 'improved', recordedAt: at(2025, 11, 1) }),
    outcomeFixture(CLINIC, 2, { outcome: 'stable', recordedAt: at(2026, 10, 3) }),
    // Dated after the current month.
    outcomeFixture(CLINIC, 3, { outcome: 'improved', recordedAt: at(2026, 11, 2) }),
  ]);
});

afterAll(async () => {
  await closeAll();
  await mongoose.connect(process.env.MONGODB_REGISTRY_URI);
  await dropAll(NAMESPACE);
  await mongoose.disconnect();
});

describe('outcomeTrend window', () => {
  it('returns exactly the requested calendar months', async () => {
    const trend = await outcomeTrend(Outcome, { windowMonths: 12, metrics, now: NOW });

    expect(trend.months.map((m) => m.month)).toEqual(monthKeysBack(12, NOW));
    expect(trend.months[0].month).toBe('2025-12');
    expect(trend.months[11].month).toBe('2026-11');
  });

  it('counts only records observed inside the window', async () => {
    const trend = await outcomeTrend(Outcome, { windowMonths: 12, metrics, now: NOW });
    const byMonth = Object.fromEntries(trend.months.map((m) => [m.month, m]));

    expect(byMonth['2025-12']).toMatchObject({ total: 1, improved: 1 });
    expect(byMonth['2026-11']).toMatchObject({ total: 1, stable: 1 });
    expect(trend.months.reduce((sum, m) => sum + m.total, 0)).toBe(2);
  });

  it('handles a one-month window', async () => {
    const trend = await outcomeTrend(Outcome, { windowMonths: 1, metrics, now: NOW });
    expect(trend.months).toEqual([
      { month: '2026-11', total: 1, improved: 0, stable: 1, declined: 0 },
    ]);
  });
});
