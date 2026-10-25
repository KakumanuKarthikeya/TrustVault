const mongoose = require('mongoose');
const Permission = require('../models/Permission');
const PasswordResetToken = require('../models/PasswordResetToken');
const TokenRevocation = require('../models/TokenRevocation');
const TwoFactorLoginChallenge = require('../models/TwoFactorLoginChallenge');

async function connectDatabase(uri = process.env.MONGODB_URI) {
  if (typeof uri !== 'string' || uri.trim() === '') {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await Permission.createIndexes();
    await PasswordResetToken.createIndexes();
    await TokenRevocation.createIndexes();
    await TwoFactorLoginChallenge.createIndexes();
  } catch (error) {
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      throw new AggregateError(
        [error, disconnectError],
        'Database index setup failed and the connection could not be closed',
      );
    }
    throw new AggregateError([error], 'Database index setup failed', {
      cause: error,
    });
  }
  return mongoose.connection;
}

module.exports = { connectDatabase };
