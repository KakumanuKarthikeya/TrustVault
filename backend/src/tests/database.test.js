const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const Permission = require('../models/Permission');
const TokenRevocation = require('../models/TokenRevocation');

describe('connectDatabase', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects an empty connection string before connecting', async () => {
    await expect(connectDatabase(' ')).rejects.toThrow(
      'MONGODB_URI is required',
    );
  });

  it('ensures permission uniqueness and persistent token-revocation indexes', async () => {
    jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
    const disconnect = jest
      .spyOn(mongoose, 'disconnect')
      .mockResolvedValue(mongoose);
    const permissionIndexes = jest
      .spyOn(Permission, 'createIndexes')
      .mockResolvedValue([]);
    const revocationIndexes = jest
      .spyOn(TokenRevocation, 'createIndexes')
      .mockResolvedValue([]);

    await connectDatabase('mongodb://localhost/trustvault-test');

    expect(mongoose.connect).toHaveBeenCalledWith(
      'mongodb://localhost/trustvault-test',
      { serverSelectionTimeoutMS: 5000 },
    );
    expect(permissionIndexes).toHaveBeenCalledTimes(1);
    expect(revocationIndexes).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('does not resolve the database connection if required indexes fail', async () => {
    jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
    const disconnect = jest
      .spyOn(mongoose, 'disconnect')
      .mockResolvedValue(mongoose);
    jest.spyOn(Permission, 'createIndexes').mockResolvedValue([]);
    jest
      .spyOn(TokenRevocation, 'createIndexes')
      .mockRejectedValue(new Error('index creation failed'));

    await expect(
      connectDatabase('mongodb://localhost/trustvault-test'),
    ).rejects.toMatchObject({
      name: 'AggregateError',
      message: 'Database index setup failed',
      errors: [expect.objectContaining({ message: 'index creation failed' })],
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('preserves the index-creation failure if disconnect also fails', async () => {
    jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
    jest
      .spyOn(mongoose, 'disconnect')
      .mockRejectedValue(new Error('disconnect failed'));
    jest
      .spyOn(Permission, 'createIndexes')
      .mockRejectedValue(new Error('index creation failed'));
    jest.spyOn(TokenRevocation, 'createIndexes').mockResolvedValue([]);

    await expect(
      connectDatabase('mongodb://localhost/trustvault-test'),
    ).rejects.toMatchObject({
      name: 'AggregateError',
      errors: [
        expect.objectContaining({ message: 'index creation failed' }),
        expect.objectContaining({ message: 'disconnect failed' }),
      ],
    });
  });
});
