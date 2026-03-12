const { configureEnv, connectRegistry, dropAll } = require('./helpers/testEnv');

const NAMESPACE = 'authlogin';
configureEnv(NAMESPACE);

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const Clinic = require('../src/models/Clinic');
const { getClinicConnection, getClinicUserModel, closeAll } = require('../src/tenancy/connectionPool');
const { seedTenants } = require('./helpers/seed');
const {
  CLINIC_ALPHA,
  CLINIC_BETA,
  CLINIC_CLOSED,
  TEST_PASSWORD,
} = require('./helpers/fixtures');

const app = createApp();

const clinics = [
  { ...CLINIC_ALPHA, dbName: `${NAMESPACE}_alpha` },
  { ...CLINIC_BETA, dbName: `${NAMESPACE}_beta` },
  { ...CLINIC_CLOSED, dbName: `${NAMESPACE}_closed` },
];

beforeAll(async () => {
  await connectRegistry();
  await seedTenants(clinics);
});

afterAll(async () => {
  await closeAll();
  await dropAll(NAMESPACE);
  await mongoose.disconnect();
});

describe('POST /api/auth/login', () => {
  it('issues a clinic-scoped token for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alpha.doctor', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET);
    expect(decoded.clinicId).toBe(CLINIC_ALPHA.clinicId);
    expect(decoded.username).toBe('alpha.doctor');
    expect(decoded.role).toBe('doctor');
    expect(decoded.userId).toBeTruthy();
  });

  it('never returns the password or password hash', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alpha.doctor', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toEqual({
      id: expect.any(String),
      username: 'alpha.doctor',
      fullName: 'Test Doctor Alpha',
      role: 'doctor',
      clinicName: CLINIC_ALPHA.name,
    });
    expect(JSON.stringify(res.body)).not.toContain(TEST_PASSWORD);
    expect(JSON.stringify(res.body)).not.toContain('$2');
  });

  it('routes a username to its own clinic, not to the first clinic in the registry', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'beta.nurse', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET);
    expect(decoded.clinicId).toBe(CLINIC_BETA.clinicId);
    expect(res.body.data.user.clinicName).toBe(CLINIC_BETA.name);
  });

  it('matches usernames case-insensitively', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ALPHA.Doctor', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe('alpha.doctor');
  });

  it('rejects a wrong password with a generic 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alpha.doctor', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid username or password');
    expect(res.body.data).toBeUndefined();
  });

  it('gives the same answer for an unknown username, so accounts cannot be enumerated', async () => {
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ username: 'no.such.user', password: TEST_PASSWORD });
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alpha.doctor', password: 'wrong-password' });

    expect(unknown.status).toBe(401);
    expect(unknown.body.message).toBe(wrongPassword.body.message);
  });

  it('refuses login for a deactivated clinic', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'closed.admin', password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/inactive/i);
    expect(res.body.data).toBeUndefined();
  });

  it.each([
    ['a missing username', { password: TEST_PASSWORD }, 'username'],
    ['a blank username', { username: '   ', password: TEST_PASSWORD }, 'username'],
    ['a missing password', { username: 'alpha.doctor' }, 'password'],
    ['a blank password', { username: 'alpha.doctor', password: '' }, 'password'],
  ])('rejects %s with 400', async (_label, body, field) => {
    const res = await request(app).post('/api/auth/login').send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors.map((e) => e.field)).toContain(field);
  });

  it('does not let a user authenticate against another clinic database', async () => {
    // The beta user's credentials live only in the beta database. Alpha's
    // database must not contain them, so per-clinic isolation holds even if the
    // registry routing were tampered with.
    const alphaConn = await getClinicConnection(CLINIC_ALPHA.clinicId, clinics[0].dbName);
    const AlphaUser = getClinicUserModel(alphaConn);
    await expect(AlphaUser.findOne({ username: 'beta.nurse' })).resolves.toBeNull();

    const betaConn = await getClinicConnection(CLINIC_BETA.clinicId, clinics[1].dbName);
    const BetaUser = getClinicUserModel(betaConn);
    await expect(BetaUser.findOne({ username: 'alpha.doctor' })).resolves.toBeNull();
  });
});

describe('GET /api/auth/clinics', () => {
  it('lists clinics without exposing their database names', async () => {
    const res = await request(app).get('/api/auth/clinics');

    expect(res.status).toBe(200);
    expect(res.body.data.clinics).toHaveLength(clinics.length);
    for (const clinic of res.body.data.clinics) {
      expect(clinic).not.toHaveProperty('dbName');
      expect(clinic).not.toHaveProperty('address');
      expect(Object.keys(clinic).sort()).toEqual(['_id', 'clinicId', 'name']);
    }
    expect(JSON.stringify(res.body)).not.toContain(NAMESPACE);
  });

  it('sorts clinics by name', async () => {
    const res = await request(app).get('/api/auth/clinics');
    const names = res.body.data.clinics.map((c) => c.name);
    expect(names).toEqual([...names].sort());
  });
});

describe('service surface', () => {
  it('exposes an unauthenticated health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'auth-service' });
  });

  it('answers unknown routes with a JSON 404', async () => {
    const res = await request(app).get('/api/auth/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('stored credentials', () => {
  it('stores a bcrypt hash rather than the plaintext password', async () => {
    const conn = await getClinicConnection(CLINIC_ALPHA.clinicId, clinics[0].dbName);
    const User = getClinicUserModel(conn);
    const user = await User.findOne({ username: 'alpha.doctor' });

    expect(user.password).not.toBe(TEST_PASSWORD);
    expect(user.password).toMatch(/^\$2[aby]\$/);
    await expect(user.comparePassword(TEST_PASSWORD)).resolves.toBe(true);
    await expect(user.comparePassword('wrong-password')).resolves.toBe(false);
  });

  it('keeps no password material in the registry', async () => {
    const registryDocs = await mongoose.connection
      .collection('userregistries')
      .find({})
      .toArray();

    expect(registryDocs.length).toBeGreaterThan(0);
    for (const doc of registryDocs) {
      expect(doc).not.toHaveProperty('password');
      expect(Object.keys(doc).sort()).toEqual(
        ['__v', '_id', 'clinicId', 'createdAt', 'updatedAt', 'username'].sort()
      );
    }
  });

  it('keeps no database name in the clinic records returned to unauthenticated callers', async () => {
    const stored = await Clinic.findOne({ clinicId: CLINIC_ALPHA.clinicId });
    expect(stored.dbName).toBe(clinics[0].dbName);
  });
});
