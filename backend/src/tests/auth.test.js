jest.mock('../models/User', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
}));

const bcrypt = require('bcrypt');
const request = require('supertest');
const User = require('../models/User');
const app = require('../app');

const userId = '64b000000000000000000001';
const testSecret = 'test-only-secret-with-at-least-32-characters';
let users;

function makeUser(values) {
  return {
    _id: userId,
    name: values.name,
    email: values.email.trim().toLowerCase(),
    passwordHash: values.passwordHash,
    role: values.role || 'owner',
    status: values.status || 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

beforeAll(() => {
  process.env.JWT_SECRET = testSecret;
});

beforeEach(() => {
  users = [];
  jest.clearAllMocks();

  User.create.mockImplementation(async (values) => {
    if (users.some((user) => user.email === values.email)) {
      const error = new Error('duplicate key');
      error.code = 11000;
      throw error;
    }
    const user = makeUser(values);
    users.push(user);
    return user;
  });
  User.findOne.mockImplementation((filter) => ({
    select: jest.fn().mockResolvedValue(
      users.find((user) => user.email === filter.email) || null,
    ),
  }));
  User.findById.mockImplementation(async (id) =>
    users.find((user) => user._id === id) || null,
  );
});

describe('Authentication API', () => {
  const registration = {
    name: 'Taylor User',
    email: 'Taylor.User@example.com',
    password: 'StrongPassword123!',
  };

  it('registers a user with a normalized email and hashed password', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send(registration);

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('taylor.user@example.com');
    expect(response.body.user.role).toBe('owner');
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.user.password).toBeUndefined();
    expect(response.body.token).toEqual(expect.any(String));
    expect(users).toHaveLength(1);
    expect(users[0].passwordHash).not.toBe(registration.password);
    await expect(
      bcrypt.compare(registration.password, users[0].passwordHash),
    ).resolves.toBe(true);
  });

  it('rejects duplicate email addresses', async () => {
    await request(app).post('/api/auth/register').send(registration);

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...registration, email: registration.email.toLowerCase() });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'Email already registered' });
  });

  it('rejects invalid input without returning validation details', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...registration, email: 'not-an-email', password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request body' });
    expect(User.create).not.toHaveBeenCalled();
  });

  it('rejects attempted administrator-role escalation', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...registration, role: 'admin' });

    expect(response.status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('fails safely when the JWT signing secret is unavailable', async () => {
    const configuredSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
      const response = await request(app)
        .post('/api/auth/register')
        .send(registration);

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        error: 'Authentication unavailable',
      });
      expect(User.create).not.toHaveBeenCalled();
    } finally {
      process.env.JWT_SECRET = configuredSecret;
    }
  });

  it('returns a generic error for an incorrect password', async () => {
    const passwordHash = await bcrypt.hash(registration.password, 4);
    users.push(makeUser({ ...registration, passwordHash }));

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: registration.email, password: 'WrongPassword123!' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid email or password' });
  });

  it('logs in successfully and returns a token without a password hash', async () => {
    const passwordHash = await bcrypt.hash(registration.password, 4);
    users.push(makeUser({ ...registration, passwordHash }));

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: registration.email, password: registration.password });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.user.password).toBeUndefined();
  });

  it('protects /me and returns the authenticated user', async () => {
    const passwordHash = await bcrypt.hash(registration.password, 4);
    users.push(makeUser({ ...registration, passwordHash }));

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: registration.email, password: registration.password });

    const unauthorized = await request(app).get('/api/auth/me');
    expect(unauthorized.status).toBe(401);

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(registration.email.toLowerCase());
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it('rejects invalid bearer tokens on /me', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authentication required' });
  });
});
