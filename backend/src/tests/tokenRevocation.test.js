const TokenRevocation = require('../models/TokenRevocation');

describe('TokenRevocation model', () => {
  it('stores hashed token IDs with a unique key and expiry-based TTL index', () => {
    const indexes = TokenRevocation.schema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ tokenIdHash: 1 }, { unique: true }],
        [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
      ]),
    );
    expect(TokenRevocation.schema.path('tokenIdHash').options.match).toEqual(
      /^[a-f0-9]{64}$/,
    );
    expect(TokenRevocation.schema.path('expiresAt').options.required).toBe(true);
    expect(TokenRevocation.schema.path('userId').options.required).toBe(true);
  });
});
