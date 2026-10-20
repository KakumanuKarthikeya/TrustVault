const mongoose = require('mongoose');
const request = require('supertest');

const app = require('../app');

describe('GET /health', () => {
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
});
