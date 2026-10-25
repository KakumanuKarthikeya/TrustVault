const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = require('./app');
const { connectDatabase } = require('./config/database');

function findErrorCode(error, seen = new Set()) {
  if (!error || typeof error !== 'object' || seen.has(error)) {
    return null;
  }
  seen.add(error);

  if (
    (typeof error.code === 'string' &&
      /^[A-Z][A-Z0-9_]*$/.test(error.code)) ||
    (typeof error.code === 'number' && Number.isSafeInteger(error.code))
  ) {
    return error.code;
  }

  const nestedErrors = [error.cause, error.error];
  if (Array.isArray(error.errors)) {
    nestedErrors.push(...error.errors);
  }
  if (error.reason?.servers instanceof Map) {
    nestedErrors.push(
      ...[...error.reason.servers.values()].map((server) => server.error),
    );
  }

  for (const nestedError of nestedErrors) {
    const code = findErrorCode(nestedError, seen);
    if (code !== null) {
      return code;
    }
  }
  return null;
}

async function startServer() {
  await connectDatabase();
  console.log('MongoDB connected successfully');

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`TrustVault backend listening on port ${port}`);
  });
}

startServer().catch((error) => {
  const phase =
    error instanceof AggregateError ? 'initialization' : 'connection';
  const errorName =
    error && typeof error.name === 'string' ? error.name : 'Error';
  const errorCode = findErrorCode(error);
  const details = [errorName, errorCode].filter(Boolean).join('; ');
  console.error(
    `Unable to start TrustVault: MongoDB ${phase} failed (${details}). Verify MONGODB_URI and database availability; connection details are withheld.`,
  );
  if (typeof errorCode === 'string' && errorCode.startsWith('ERR_SSL_')) {
    console.error(
      'MongoDB TLS handshake failed. Check Atlas availability and network, firewall, or proxy settings; TLS verification remains enabled.',
    );
  }
  process.exitCode = 1;
});
