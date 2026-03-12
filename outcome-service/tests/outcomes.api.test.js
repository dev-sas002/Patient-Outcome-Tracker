const { configureEnv, connectRegistry, dropAll } = require('./helpers/testEnv');

const NAMESPACE = 'outcapi';
configureEnv(NAMESPACE);

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const Clinic = require('../src/models/Clinic');
const { getClinicConnection, getClinicOutcomeModel, closeAll } = require('../src/tenancy/connectionPool');
const { CLINIC_ALPHA, CLINIC_BETA, outcomeFixture, signToken, bearer } = require('./helpers/fixtures');

const app = createApp();

const clinics = [
  { ...CLINIC_ALPHA, dbName: `${NAMESPACE}_alpha` },
  { ...CLINIC_BETA, dbName: `${NAMESPACE}_beta` },
];

async function outcomeModelFor(clinic) {
  const conn = await getClinicConnection(clinic.clinicId, clinic.dbName);
  return getClinicOutcomeModel(conn);
}

beforeAll(async () => {
  await connectRegistry();
});

afterAll(async () => {
  await closeAll();
  await dropAll(NAMESPACE);
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Clinic.deleteMany({});
  await Clinic.insertMany(clinics);
  for (const clinic of clinics) {
    const Outcome = await outcomeModelFor(clinic);
    await Outcome.deleteMany({});
  }
});

async function seedOutcomes(clinic, count, overrides = []) {
  const Outcome = await outcomeModelFor(clinic);
  const docs = [];
  for (let i = 0; i < count; i += 1) {
    docs.push(outcomeFixture(clinic.clinicId, i, overrides[i] || {}));
  }
  return Outcome.insertMany(docs);
}

describe('GET /api/outcomes', () => {
  it('returns the calling clinic records with pagination metadata', async () => {
    await seedOutcomes(clinics[0], 3);

    const res = await request(app)
      .get('/api/outcomes')
      .set('Authorization', bearer(signToken()));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.outcomes).toHaveLength(3);
    expect(res.body.data.pagination).toEqual({ total: 3, page: 1, limit: 20, pages: 1 });
  });

  it('returns newest records first', async () => {
    const Outcome = await outcomeModelFor(clinics[0]);
    await Outcome.create(outcomeFixture(CLINIC_ALPHA.clinicId, 0, { patientName: 'Older Record' }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await Outcome.create(outcomeFixture(CLINIC_ALPHA.clinicId, 1, { patientName: 'Newer Record' }));

    const res = await request(app)
      .get('/api/outcomes')
      .set('Authorization', bearer(signToken()));

    expect(res.status).toBe(200);
    expect(res.body.data.outcomes.map((o) => o.patientName)).toEqual([
      'Newer Record',
      'Older Record',
    ]);
  });

  it('filters by a valid outcome value and ignores an invalid one', async () => {
    await seedOutcomes(clinics[0], 3); // improved, stable, declined

    const filtered = await request(app)
      .get('/api/outcomes?outcome=declined')
      .set('Authorization', bearer(signToken()));
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.outcomes).toHaveLength(1);
    expect(filtered.body.data.outcomes[0].outcome).toBe('declined');

    const bogus = await request(app)
      .get('/api/outcomes?outcome=not-a-real-status')
      .set('Authorization', bearer(signToken()));
    expect(bogus.status).toBe(200);
    expect(bogus.body.data.outcomes).toHaveLength(3);
  });

  it('cannot be used to read another clinic records by passing a query filter', async () => {
    await seedOutcomes(clinics[1], 2);

    const res = await request(app)
      .get(`/api/outcomes?clinicId=${CLINIC_BETA.clinicId}`)
      .set('Authorization', bearer(signToken()));

    expect(res.status).toBe(200);
    expect(res.body.data.outcomes).toHaveLength(0);
  });
});

describe('GET /api/outcomes pagination handling', () => {
  beforeEach(async () => {
    await seedOutcomes(clinics[0], 5);
  });

  it('honours an explicit page and limit', async () => {
    const res = await request(app)
      .get('/api/outcomes?page=2&limit=2')
      .set('Authorization', bearer(signToken()));

    expect(res.status).toBe(200);
    expect(res.body.data.outcomes).toHaveLength(2);
    expect(res.body.data.pagination).toEqual({ total: 5, page: 2, limit: 2, pages: 3 });
  });

  it('falls back to defaults for unparsable page and limit values', async () => {
    const res = await request(app)
      .get('/api/outcomes?page=abc&limit=xyz')
      .set('Authorization', bearer(signToken()));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.pagination.limit).toBe(20);
    expect(res.body.data.outcomes).toHaveLength(5);
  });

  it('rejects a negative page instead of computing a negative skip', async () => {
    const res = await request(app)
      .get('/api/outcomes?page=-3')
      .set('Authorization', bearer(signToken()));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.outcomes).toHaveLength(5);
  });

  it('never divides by a zero limit', async () => {
    const res = await request(app)
      .get('/api/outcomes?limit=0')
      .set('Authorization', bearer(signToken()));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.limit).toBe(20);
    expect(Number.isFinite(res.body.data.pagination.pages)).toBe(true);
  });

  it('caps the page size so a single request cannot dump every record', async () => {
    const res = await request(app)
      .get('/api/outcomes?limit=100000')
      .set('Authorization', bearer(signToken()));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.limit).toBe(100);
  });
});

describe('POST /api/outcomes', () => {
  const validBody = {
    patientName: 'Test Patient Zed',
    age: 41,
    diagnosis: 'Synthetic Condition Z',
    treatment: 'Synthetic Protocol Z',
    outcome: 'improved',
    notes: 'Synthetic note Z',
  };

  it('creates a record scoped to the caller clinic', async () => {
    const res = await request(app)
      .post('/api/outcomes')
      .set('Authorization', bearer(signToken()))
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data.clinicId).toBe(CLINIC_ALPHA.clinicId);
    expect(res.body.data.createdBy).toBe('test.user');

    const Outcome = await outcomeModelFor(clinics[0]);
    await expect(Outcome.countDocuments({})).resolves.toBe(1);

    const BetaOutcome = await outcomeModelFor(clinics[1]);
    await expect(BetaOutcome.countDocuments({})).resolves.toBe(0);
  });

  it('ignores clinicId and createdBy supplied by the client', async () => {
    const res = await request(app)
      .post('/api/outcomes')
      .set('Authorization', bearer(signToken()))
      .send({ ...validBody, clinicId: CLINIC_BETA.clinicId, createdBy: 'someone.else' });

    expect(res.status).toBe(201);
    expect(res.body.data.clinicId).toBe(CLINIC_ALPHA.clinicId);
    expect(res.body.data.createdBy).toBe('test.user');

    const BetaOutcome = await outcomeModelFor(clinics[1]);
    await expect(BetaOutcome.countDocuments({})).resolves.toBe(0);
  });

  it('accepts a record without an age', async () => {
    const { age, ...noAge } = validBody;
    const res = await request(app)
      .post('/api/outcomes')
      .set('Authorization', bearer(signToken()))
      .send(noAge);

    expect(res.status).toBe(201);
    expect(res.body.data.age).toBeUndefined();
  });

  it.each([
    ['a missing patient name', { ...validBody, patientName: '   ' }, 'patientName'],
    ['a missing diagnosis', { ...validBody, diagnosis: '' }, 'diagnosis'],
    ['a missing treatment', { ...validBody, treatment: '' }, 'treatment'],
    ['an unknown outcome value', { ...validBody, outcome: 'cured' }, 'outcome'],
    ['an out-of-range age', { ...validBody, age: 900 }, 'age'],
    ['a negative age', { ...validBody, age: -1 }, 'age'],
  ])('rejects %s with 400', async (_label, body, field) => {
    const res = await request(app)
      .post('/api/outcomes')
      .set('Authorization', bearer(signToken()))
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.map((e) => e.field)).toContain(field);

    const Outcome = await outcomeModelFor(clinics[0]);
    await expect(Outcome.countDocuments({})).resolves.toBe(0);
  });
});

describe('GET /api/outcomes/stats', () => {
  it('counts only the caller clinic records', async () => {
    await seedOutcomes(clinics[0], 4); // improved, stable, declined, improved
    await seedOutcomes(clinics[1], 3);

    const res = await request(app)
      .get('/api/outcomes/stats')
      .set('Authorization', bearer(signToken()));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ improved: 2, stable: 1, declined: 1, total: 4 });
  });

  it('returns zeroes for a clinic with no records', async () => {
    const res = await request(app)
      .get('/api/outcomes/stats')
      .set('Authorization', bearer(signToken()));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ improved: 0, stable: 0, declined: 0, total: 0 });
  });

  it('is reachable and is not captured by the collection route', async () => {
    await seedOutcomes(clinics[0], 1);
    const res = await request(app)
      .get('/api/outcomes/stats')
      .set('Authorization', bearer(signToken()));

    expect(res.body.data).not.toHaveProperty('outcomes');
    expect(res.body.data.total).toBe(1);
  });
});

describe('service surface', () => {
  it('exposes an unauthenticated health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'outcome-service' });
  });

  it('answers unknown routes with a JSON 404', async () => {
    const res = await request(app)
      .get('/api/outcomes/does-not-exist/nested')
      .set('Authorization', bearer(signToken()));
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
