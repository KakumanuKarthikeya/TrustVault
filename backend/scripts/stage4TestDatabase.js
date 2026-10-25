const EXPECTED_DATABASE_NAME = 'trustvault_stage4_test';

function getDatabaseName(uri) {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new Error('A dedicated Stage 4 test database URI is required');
  }

  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('The Stage 4 test database URI is invalid');
  }

  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
    throw new Error('The Stage 4 test database URI must use MongoDB');
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new Error('The Stage 4 test database name is invalid');
  }

  if (databaseName !== EXPECTED_DATABASE_NAME) {
    throw new Error(
      `Stage 4 integration tests require database ${EXPECTED_DATABASE_NAME}`,
    );
  }

  return databaseName;
}

function assertStage4TestDatabase(uri, confirmation) {
  const databaseName = getDatabaseName(uri);
  if (confirmation !== databaseName) {
    throw new Error(
      `Set TRUSTVAULT_TEST_DATABASE_CONFIRM=${databaseName} to explicitly allow integration tests`,
    );
  }
  return databaseName;
}

module.exports = {
  assertStage4TestDatabase,
  EXPECTED_DATABASE_NAME,
};
