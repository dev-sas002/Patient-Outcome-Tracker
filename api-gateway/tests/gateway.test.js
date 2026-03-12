const http = require('http');
const express = require('express');
const request = require('supertest');
const { createGateway } = require('../src/app');

// A stand-in for both backend services that echoes what reached it, so the
// suite checks routing without MongoDB or the real services.
function startUpstream(name) {
  const app = express();
  app.use(express.json());
  app.all(/.*/, (req, res) => {
    res.json({ upstream: name, method: req.method, path: req.originalUrl, body: req.body });
  });
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function urlOf(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

let auth;
let outcome;

beforeAll(async () => {
  auth = await startUpstream('auth');
  outcome = await startUpstream('outcome');
});

afterAll(async () => {
  await Promise.all([auth, outcome].map((server) => new Promise((done) => server.close(done))));
});

function gateway(overrides = {}) {
  return createGateway({
    authServiceUrl: urlOf(auth),
    outcomeServiceUrl: urlOf(outcome),
    corsOrigins: ['http://localhost:8330'],
    loginLimit: { max: 3, windowMs: 60_000 },
    ...overrides,
  });
}

describe('routing', () => {
  it('sends /api/auth to the auth service with the body intact', async () => {
    const res = await request(gateway())
      .post('/api/auth/login')
      .send({ username: 'demo.user', password: 'not-a-real-password' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      upstream: 'auth',
      path: '/api/auth/login',
      body: { username: 'demo.user' },
    });
  });

  it('sends /api/outcomes to the outcome service with its query string', async () => {
    const res = await request(gateway()).get('/api/outcomes/trends?months=6');

    expect(res.body).toMatchObject({ upstream: 'outcome', path: '/api/outcomes/trends?months=6' });
  });

  it('answers its own health check and a JSON 404 for anything else', async () => {
    const app = gateway();
    await request(app).get('/health').expect(200, { status: 'ok', service: 'api-gateway' });
    const missing = await request(app).get('/api/unknown');
    expect(missing.status).toBe(404);
    expect(missing.body.success).toBe(false);
  });

  it('returns 502 with a JSON body when a service is down', async () => {
    const down = http.createServer();
    await new Promise((resolve) => down.listen(0, '127.0.0.1', resolve));
    const deadUrl = urlOf(down);
    await new Promise((resolve) => down.close(resolve));

    const res = await request(gateway({ outcomeServiceUrl: deadUrl })).get('/api/outcomes');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ success: false, message: 'Outcome service is unavailable' });
  });
});

describe('login throttling', () => {
  it('lets the configured number of attempts through, then answers 429', async () => {
    const app = gateway();
    const attempt = () => request(app).post('/api/auth/login').send({ username: 'x', password: 'y' });

    for (let i = 0; i < 3; i += 1) {
      expect((await attempt()).status).toBe(200);
    }
    const blocked = await attempt();

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.headers).toHaveProperty('retry-after');
  });

  it('does not count other auth routes against the login budget', async () => {
    const app = gateway();
    for (let i = 0; i < 5; i += 1) {
      expect((await request(app).get('/api/auth/clinics')).status).toBe(200);
    }
  });
});
