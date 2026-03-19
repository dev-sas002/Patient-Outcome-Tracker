const { configureEnv, connectRegistry, dropAll } = require('./helpers/testEnv');

const NAMESPACE = 'outcaccess';
configureEnv(NAMESPACE);

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const Clinic = require('../src/models/Clinic');
const { getClinicConnection, getClinicOutcomeModel, closeAll } = require('../src/tenancy/connectionPool');
const {
  CLINIC_ALPHA,
  CLINIC_BETA,
  CLINIC_CLOSED,
  outcomeFixture,
  signToken,
  bearer,
} = require('./helpers/fixtures');

const app = createApp();

const clinics = [
  { ...CLINIC_ALPHA, dbName: `${NAMESPACE}_alpha` },
  { ...CLINIC_BETA, dbName: `${NAMESPACE}_beta` },
  { ...CLINIC_CLOSED, dbName: `${NAMESPACE}_closed` },
];

async function outcomeModelFor(clinic) {
  const conn = await getClinicConnection(clinic.clinicId, clinic.dbName);
  return getClinicOutcomeModel(conn);
}

beforeAll(async () => {
  await connectRegistry();
  await Clinic.deleteMany({});
  await Clinic.insertMany(clinics);

  // Each clinic gets its own record set in its own database.
  for (const clinic of clinics) {
    const Outcome = await outcomeModelFor(clinic);
    await Outcome.deleteMany({});
    await Outcome.insertMany([
      outcomeFixture(clinic.clinicId, 0, { patientName: `Patient Of ${clinic.clinicId}` }),
      outcomeFixture(clinic.clinicId, 1, { patientName: `Second Of ${clinic.clinicId}` }),
    ]);
  }
});

afterAll(async () => {
  await closeAll();
  await dropAll(NAMESPACE);
  await mongoose.disconnect();
});

describe('authentication', () => {
  it.each([
    ['GET', '/api/outcomes'],
    ['GET', '/api/outcomes/stats'],
    ['POST', '/api/outcomes'],
  ])('rejects %s %s without a token', async (method, path) => {
    const res = await request(app)[method.toLowerCase()](path);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a non-Bearer Authorization header', async () => {
    const res = await request(app).get('/api/outcomes').set('Authorization', 'Basic dXNlcjpwdw==');
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = signToken({}, { secret: 'a-different-secret' });
    const res = await request(app).get('/api/outcomes').set('Authorization', bearer(forged));
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid token/i);
  });

  it('rejects an expired token with a distinguishable message', async () => {
    const expired = signToken({}, { expiresIn: '-10s' });
    const res = await request(app).get('/api/outcomes').set('Authorization', bearer(expired));
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('rejects an unsigned (alg: none) token', async () => {
    const unsigned = jwt.sign(
      { userId: '1', username: 'test.user', clinicId: CLINIC_ALPHA.clinicId },
      null,
      { algorithm: 'none' }
    );
    const res = await request(app).get('/api/outcomes').set('Authorization', bearer(unsigned));
    expect(res.status).toBe(401);
  });

  it('rejects a correctly signed token that carries no clinic claim', async () => {
    // Without this guard the clinic lookup and the record filter both become
    // unscoped, which would hand the caller another clinic's patient data.
    const unscoped = jwt.sign(
      { userId: '000000000000000000000001', username: 'test.user', role: 'doctor' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request(app).get('/api/outcomes').set('Authorization', bearer(unscoped));
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('data');
  });

  it('rejects a correctly signed token that carries no user claim', async () => {
    const unscoped = jwt.sign(
      { clinicId: CLINIC_ALPHA.clinicId, role: 'doctor' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request(app).get('/api/outcomes').set('Authorization', bearer(unscoped));
    expect(res.status).toBe(401);
  });
});

describe('cross-clinic isolation', () => {
  it('shows a clinic only its own records', async () => {
    const alpha = await request(app)
      .get('/api/outcomes')
      .set('Authorization', bearer(signToken({ clinicId: CLINIC_ALPHA.clinicId })));
    const beta = await request(app)
      .get('/api/outcomes')
      .set('Authorization', bearer(signToken({ clinicId: CLINIC_BETA.clinicId })));

    expect(alpha.status).toBe(200);
    expect(beta.status).toBe(200);

    const alphaNames = alpha.body.data.outcomes.map((o) => o.patientName);
    const betaNames = beta.body.data.outcomes.map((o) => o.patientName);

    expect(alphaNames).toHaveLength(2);
    expect(betaNames).toHaveLength(2);
    expect(alphaNames.every((n) => n.includes(CLINIC_ALPHA.clinicId))).toBe(true);
    expect(betaNames.every((n) => n.includes(CLINIC_BETA.clinicId))).toBe(true);
    expect(alphaNames.some((n) => betaNames.includes(n))).toBe(false);
  });

  it('scopes the stats aggregation to the caller clinic', async () => {
    const alpha = await request(app)
      .get('/api/outcomes/stats')
      .set('Authorization', bearer(signToken({ clinicId: CLINIC_ALPHA.clinicId })));

    expect(alpha.status).toBe(200);
    expect(alpha.body.data.total).toBe(2);
  });
});

describe('clinic authorization', () => {
  it('refuses a token for a clinic that is not in the registry', async () => {
    const res = await request(app)
      .get('/api/outcomes')
      .set('Authorization', bearer(signToken({ clinicId: 'test-clinic-nonexistent' })));

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    // The reply must not confirm whether that clinic id exists.
    expect(res.body.message).not.toMatch(/test-clinic-nonexistent/);
  });

  it('refuses reads for a deactivated clinic even with a still-valid token', async () => {
    const res = await request(app)
      .get('/api/outcomes')
      .set('Authorization', bearer(signToken({ clinicId: CLINIC_CLOSED.clinicId })));

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/inactive/i);
  });

  it('refuses writes for a deactivated clinic', async () => {
    const res = await request(app)
      .post('/api/outcomes')
      .set('Authorization', bearer(signToken({ clinicId: CLINIC_CLOSED.clinicId })))
      .send({
        patientName: 'Test Patient Blocked',
        diagnosis: 'Synthetic Condition B',
        treatment: 'Synthetic Protocol B',
        outcome: 'stable',
      });

    expect(res.status).toBe(403);

    const Outcome = await outcomeModelFor(clinics[2]);
    await expect(Outcome.countDocuments({})).resolves.toBe(2);
  });

  it('refuses stats for a deactivated clinic', async () => {
    const res = await request(app)
      .get('/api/outcomes/stats')
      .set('Authorization', bearer(signToken({ clinicId: CLINIC_CLOSED.clinicId })));

    expect(res.status).toBe(403);
  });
});
