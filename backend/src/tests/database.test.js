const { connectDatabase } = require('../config/database');

describe('connectDatabase', () => {
  it('rejects an empty connection string before connecting', async () => {
    await expect(connectDatabase(' ')).rejects.toThrow(
      'MONGODB_URI is required',
    );
  });
});
