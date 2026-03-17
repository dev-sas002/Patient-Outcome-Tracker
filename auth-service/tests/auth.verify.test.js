const { configureEnv, connectRegistry, dropAll } = require('./helpers/testEnv');

const NAMESPACE = 'authverify';
configureEnv(NAMESPACE);

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const Clinic = require('../src/models/Clinic');
const { getClinicConnection, getClinicUserModel, closeAll } = require('../src/tenancy/connectionPool');
const { seedTenants } = require('./helpers/seed');
const { CLINIC_ALPHA, CLINIC_BETA, CLINIC_CLOSED, TEST_PASSWORD } = require('./helpers/fixtures');

const app = createApp();

const clinics = [
  { ...CLINIC_ALPHA, dbName: `${NAMESPACE}_alpha` },
  { ...CLINIC_BETA, dbName: `${NAMESPACE}_beta` },
  { ...CLINIC_CLOSED, dbName: `${NAMESPACE}_closed` },
];

async function tokenFor(username) {
  const res = await request(app).post('/api/auth/login').send({ username, password: TEST_PASSWORD });
  return res.body.data.token;
}

async function userIdFor(clinic, username) {
  const conn = await getClinicConnection(clinic.clinicId, clinic.dbName);
  const User = getClinicUserModel(conn);
  const user = await User.findOne({ username });
  return user._id.toString();
}

beforeAll(async () => {
  await connectRegistry();
  await seedTenants(clinics);
});

afterAll(async () => {
  await closeAll();
  await dropAll(NAMESPACE);
  await mongoose.disconnect();
});

describe('GET /api/auth/verify', () => {
  it('returns the identity behind a valid token', async () => {
    const token = await tokenFor('alpha.doctor');
    const res = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toEqual({
      id: expect.any(String),
      username: 'alpha.doctor',
      fullName: 'Test Doctor Alpha',
      role: 'doctor',
      clinicId: CLINIC_ALPHA.clinicId,
      clinicName: CLINIC_ALPHA.name,
    });
    expect(JSON.stringify(res.body)).not.toContain('$2');
  });

  it.each([
    ['no Authorization header', undefined],
    ['a non-Bearer scheme', 'Basic dXNlcjpwdw=='],
    ['a garbage token', 'Bearer not-a-jwt'],
  ])('rejects %s with 401', async (_label, header) => {
    const req = request(app).get('/api/auth/verify');
    if (header) req.set('Authorization', header);
    const res = await req;

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = jwt.sign(
      { userId: '000000000000000000000001', username: 'alpha.doctor', clinicId: CLINIC_ALPHA.clinicId },
      'some-other-secret',
      { expiresIn: '1h' }
    );
    const res = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign(
      { userId: '000000000000000000000001', username: 'alpha.doctor', clinicId: CLINIC_ALPHA.clinicId },
      process.env.JWT_SECRET,
      { expiresIn: '-10s' }
    );
    const res = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('rejects a signed token that carries no clinic claim', async () => {
    const unscoped = jwt.sign(
      { userId: '000000000000000000000001', username: 'alpha.doctor' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${unscoped}`);

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('data');
  });

  it('rejects a signed token that carries no user claim', async () => {
    const unscoped = jwt.sign({ clinicId: CLINIC_ALPHA.clinicId }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });
    const res = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${unscoped}`);
    expect(res.status).toBe(401);
  });

  it('does not resolve a user id from one clinic against another clinic database', async () => {
    // A token that pairs the beta user's id with alpha's clinic must not
    // resolve: user lookup happens inside the clinic's own database.
    const betaUserId = await userIdFor(clinics[1], 'beta.nurse');
    const crossTenant = jwt.sign(
      { userId: betaUserId, username: 'beta.nurse', clinicId: CLINIC_ALPHA.clinicId, role: 'nurse' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${crossTenant}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('User not found');
  });

  it('refuses a still-valid token once its clinic is deactivated', async () => {
    // Login is blocked for an inactive clinic, but tokens issued before the
    // clinic was deactivated stay cryptographically valid until they expire.
    const stillValid = jwt.sign(
      {
        userId: await userIdFor(clinics[2], 'closed.admin'),
        username: 'closed.admin',
        clinicId: CLINIC_CLOSED.clinicId,
        role: 'admin',
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${stillValid}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/inactive/i);
  });

  it('rejects a token for a clinic that is no longer in the registry', async () => {
    const orphan = jwt.sign(
      { userId: '000000000000000000000001', username: 'ghost.user', clinicId: 'test-clinic-gone' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${orphan}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Clinic not found');
  });

  it('reports a registry failure as a server error, not as an auth failure', async () => {
    // A database outage used to be reported as "invalid or expired token",
    // which sends healthy clients into a pointless re-login loop.
    const token = await tokenFor('alpha.doctor');
    const spy = jest.spyOn(Clinic, 'findOne').mockRejectedValueOnce(new Error('registry down'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    spy.mockRestore();
    errorSpy.mockRestore();
  });

  it('does not write identifying data into the error log', async () => {
    const token = await tokenFor('alpha.doctor');
    jest.spyOn(Clinic, 'findOne').mockRejectedValueOnce(new Error('registry down'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${token}`);

    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('alpha.doctor');
    expect(logged).not.toContain(token);
    errorSpy.mockRestore();
  });
});
