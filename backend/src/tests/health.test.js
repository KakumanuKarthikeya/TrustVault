const mongoose = require('mongoose');
const request = require('supertest');

const app = require('../app');

describe('GET /health', () => {
  beforeEach(async () => {
    await mongoose.disconnect();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('reports the service as unavailable when MongoDB is disconnected', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'unavailable',
      database: 'disconnected',
    });
  });

  it.each([
    ['POST', '/api/auth/login', { email: 'user@example.com', password: 'password' }],
    ['GET', '/api/documents', null],
  ])(
    'returns 503 for %s %s while MongoDB is disconnected',
    async (method, path, body) => {
      let apiRequest = request(app)[method.toLowerCase()](path);
      if (body) apiRequest = apiRequest.send(body);

      const response = await apiRequest;

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'Database unavailable' });
    },
  );
});
