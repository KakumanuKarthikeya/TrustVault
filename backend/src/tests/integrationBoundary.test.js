const mongoose = require('mongoose');

const allowedOrigin = 'http://localhost:5173';
const previousCorsOrigins = process.env.CORS_ORIGINS;
process.env.CORS_ORIGINS = allowedOrigin;

const request = require('supertest');
const app = require('../app');

afterAll(() => {
  if (previousCorsOrigins === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = previousCorsOrigins;
});

describe('HTTP integration boundaries', () => {
  beforeEach(() => {
    mongoose.connection.readyState = 1;
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  test('allows the configured frontend origin to preflight API requests', async () => {
    const response = await request(app)
      .options('/api/auth/login')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain(
      'content-type',
    );
  });

  test('does not grant CORS access to an unconfigured frontend origin', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://untrusted.example');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('returns a sanitized error for malformed JSON without exposing internals', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request' });
    expect(JSON.stringify(response.body)).not.toMatch(/stack|SyntaxError|node_modules/i);
  });
});
