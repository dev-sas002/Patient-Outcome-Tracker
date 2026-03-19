const { configureEnv, connectRegistry, dropAll } = require('./helpers/testEnv');

const NAMESPACE = 'outcinsight';
configureEnv(NAMESPACE);

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const Clinic = require('../src/models/Clinic');
const { getClinicConnection, getClinicOutcomeModel, closeAll } = require('../src/tenancy/connectionPool');
const { CLINIC_ALPHA, CLINIC_BETA, outcomeFixture, signToken, bearer } = require('./helpers/fixtures');

const clinics = [
  { ...CLINIC_ALPHA, dbName: `${NAMESPACE}_alpha` },
  { ...CLINIC_BETA, dbName: `${NAMESPACE}_beta` },
];

// A stub provider stands in for the model: the suite must never make a paid
// call, and the endpoint's contract is the same either way.
const stubProvider = {
  name: 'stub',
  available: true,
  received: null,
  async summarise(briefing) {
    stubProvider.received = briefing;
    return { provider: 'stub', headline: 'Stubbed', points: ['stub point'] };
  },
};

const app = createApp({ summaryProvider: stubProvider });

async function outcomeModelFor(clinic) {
  return getClinicOutcomeModel(await getClinicConnection(clinic.clinicId, clinic.dbName));
}

function monthsAgo(n, day = 10) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, day, 12));
}

beforeAll(async () => {
  await connectRegistry();
  await Clinic.deleteMany({});
  await Clinic.insertMany(clinics);

  const Alpha = await outcomeModelFor(clinics[0]);
  await Alpha.deleteMany({});

  const docs = [];
  // Six "Condition Common" records across two months, with a PHQ-9 that falls
  // (an improvement, because the registry says lower is better).
  for (let i = 0; i < 6; i += 1) {
    docs.push(
      outcomeFixture(CLINIC_ALPHA.clinicId, i, {
        diagnosis: 'Condition Common',
        outcome: i < 4 ? 'improved' : 'stable',
        recordedAt: monthsAgo(i < 3 ? 2 : 1),
        measures: { phq9: i < 3 ? 18 : 9 },
      })
    );
  }
  // Two records of a rare condition: below the suppression floor of five.
  for (let i = 0; i < 2; i += 1) {
    docs.push(
      outcomeFixture(CLINIC_ALPHA.clinicId, i, {
        diagnosis: 'Condition Rare',
        outcome: 'declined',
        recordedAt: monthsAgo(1),
      })
    );
  }
  await Alpha.insertMany(docs);

  const Beta = await outcomeModelFor(clinics[1]);
  await Beta.deleteMany({});
  await Beta.insertMany([
    outcomeFixture(CLINIC_BETA.clinicId, 0, {
      diagnosis: 'Condition Beta Only',
      recordedAt: monthsAgo(1),
    }),
  ]);
});

afterAll(async () => {
  await closeAll();
  await dropAll(NAMESPACE);
  await mongoose.disconnect();
});

const alphaAuth = () => bearer(signToken({ clinicId: CLINIC_ALPHA.clinicId }));

describe('GET /api/outcomes/metrics', () => {
  it('reports the configured measures so a client does not hardcode them', async () => {
    const res = await request(app).get('/api/outcomes/metrics').set('Authorization', alphaAuth());
    expect(res.status).toBe(200);
    const ids = res.body.data.metrics.map((m) => m.id);
    expect(ids).toContain('phq9');
    expect(res.body.data.metrics.every((m) => m.direction && m.label)).toBe(true);
  });

  it('requires a token like every other route', async () => {
    await expect(request(app).get('/api/outcomes/metrics')).resolves.toMatchObject({ status: 401 });
  });
});

describe('POST /api/outcomes with measures', () => {
  it('stores a valid measure', async () => {
    const res = await request(app)
      .post('/api/outcomes')
      .set('Authorization', alphaAuth())
      .send({
        patientName: 'Test Patient Measured',
        diagnosis: 'Condition Common',
        treatment: 'Synthetic Protocol M',
        outcome: 'improved',
        measures: { phq9: 7 },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.measures).toEqual({ phq9: 7 });

    const Alpha = await outcomeModelFor(clinics[0]);
    await Alpha.deleteOne({ patientName: 'Test Patient Measured' });
  });

  it('rejects an unknown measure with a 400 naming the metric, not the value', async () => {
    const res = await request(app)
      .post('/api/outcomes')
      .set('Authorization', alphaAuth())
      .send({
        patientName: 'Test Patient Rejected',
        diagnosis: 'Condition Common',
        treatment: 'Synthetic Protocol R',
        outcome: 'improved',
        measures: { invented_score: 42 },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invented_score/);
    expect(res.body.message).not.toMatch(/42/);
  });

  it('rejects an out-of-range measure', async () => {
    const res = await request(app)
      .post('/api/outcomes')
      .set('Authorization', alphaAuth())
      .send({
        patientName: 'Test Patient Range',
        diagnosis: 'Condition Common',
        treatment: 'Synthetic Protocol X',
        outcome: 'improved',
        measures: { phq9: 900 },
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('measure_out_of_range');
  });
});

describe('GET /api/outcomes/trends', () => {
  it('returns one bucket per month in the window, including empty ones', async () => {
    const res = await request(app)
      .get('/api/outcomes/trends?months=6')
      .set('Authorization', alphaAuth());

    expect(res.status).toBe(200);
    expect(res.body.data.windowMonths).toBe(6);
    expect(res.body.data.months).toHaveLength(6);
    // A month with no records is an explicit zero, not a missing point.
    expect(res.body.data.months.some((m) => m.total === 0)).toBe(true);
    expect(res.body.data.months.reduce((n, m) => n + m.total, 0)).toBe(8);
  });

  it('reports a measure moving in the direction the registry calls better', async () => {
    const res = await request(app)
      .get('/api/outcomes/trends?months=6')
      .set('Authorization', alphaAuth());

    const phq9 = res.body.data.measures.find((m) => m.metricId === 'phq9');
    expect(phq9).toMatchObject({ direction: 'lower-is-better' });
    expect(phq9.change).toMatchObject({ from: 18, to: 9, improving: true });
  });

  it('clamps an absurd window instead of scanning forever', async () => {
    const res = await request(app)
      .get('/api/outcomes/trends?months=100000')
      .set('Authorization', alphaAuth());
    expect(res.body.data.windowMonths).toBe(60);
  });

  it('shows a clinic only its own trend', async () => {
    const res = await request(app)
      .get('/api/outcomes/trends')
      .set('Authorization', bearer(signToken({ clinicId: CLINIC_BETA.clinicId })));
    expect(res.body.data.months.reduce((n, m) => n + m.total, 0)).toBe(1);
  });
});

describe('GET /api/outcomes/cohorts', () => {
  it('reports cohorts at or above the suppression floor', async () => {
    const res = await request(app).get('/api/outcomes/cohorts').set('Authorization', alphaAuth());

    expect(res.status).toBe(200);
    const common = res.body.data.cohorts.find((c) => c.diagnosis === 'Condition Common');
    expect(common).toMatchObject({ total: 6, improved: 4, improvedRate: 0.667 });
  });

  it('suppresses a cohort too small to describe anything but individuals', async () => {
    const res = await request(app).get('/api/outcomes/cohorts').set('Authorization', alphaAuth());

    const names = res.body.data.cohorts.map((c) => c.diagnosis);
    expect(names).not.toContain('Condition Rare');
    expect(names).toContain('Other (grouped)');
    expect(res.body.data.suppressedGroups).toBe(1);
    expect(res.body.data.note).toMatch(/fewer than 5 records/);
  });

  it('never reports another clinic diagnosis', async () => {
    const res = await request(app).get('/api/outcomes/cohorts').set('Authorization', alphaAuth());
    expect(JSON.stringify(res.body)).not.toMatch(/Condition Beta Only/);
  });
});

describe('GET /api/outcomes/insights', () => {
  it('returns the summary together with the briefing it was written from', async () => {
    const res = await request(app).get('/api/outcomes/insights').set('Authorization', alphaAuth());

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({ provider: 'stub', headline: 'Stubbed' });
    // Showing the inputs is the contract: decision support you cannot audit is
    // not decision support.
    expect(res.body.data.briefing.totals.records).toBe(8);
    expect(res.body.data.briefing.diagnosisCohorts.length).toBeGreaterThan(0);
  });

  it('frames the answer as decision support rather than diagnosis', async () => {
    const res = await request(app).get('/api/outcomes/insights').set('Authorization', alphaAuth());
    expect(res.body.data.disclaimer).toMatch(/decision support only/i);
    expect(res.body.data.disclaimer).toMatch(/not a diagnosis/i);
  });

  it('hands the provider aggregates only', async () => {
    await request(app).get('/api/outcomes/insights').set('Authorization', alphaAuth());
    const serialised = JSON.stringify(stubProvider.received);
    expect(serialised).not.toMatch(/Test Patient/);
    expect(serialised).not.toMatch(/Synthetic note/);
  });

  it('is scoped to the caller clinic', async () => {
    const res = await request(app)
      .get('/api/outcomes/insights')
      .set('Authorization', bearer(signToken({ clinicId: CLINIC_BETA.clinicId })));
    expect(res.body.data.briefing.totals.records).toBe(1);
    expect(res.body.data.briefing.clinic).toBe(CLINIC_BETA.name);
  });

  it('refuses a clinic the caller may not read', async () => {
    const res = await request(app)
      .get('/api/outcomes/insights')
      .set('Authorization', bearer(signToken({ clinicId: 'test-clinic-nonexistent' })));
    expect(res.status).toBe(403);
  });
});
