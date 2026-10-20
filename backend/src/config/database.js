const mongoose = require('mongoose');

async function connectDatabase(uri = process.env.MONGODB_URI) {
  if (typeof uri !== 'string' || uri.trim() === '') {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

module.exports = { connectDatabase };
