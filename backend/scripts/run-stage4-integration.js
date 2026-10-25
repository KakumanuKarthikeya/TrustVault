const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const {
  assertStage4TestDatabase,
} = require('./stage4TestDatabase');

const testEnvironmentPath = path.resolve(__dirname, '..', '.env.test');
dotenv.config({ path: testEnvironmentPath, quiet: true });

let databaseName;
try {
  databaseName = assertStage4TestDatabase(
    process.env.TRUSTVAULT_TEST_MONGODB_URI,
    process.env.TRUSTVAULT_TEST_DATABASE_CONFIRM,
  );
} catch (error) {
  console.error(error.message);
  console.error(
    'Create backend/.env.test from backend/.env.test.example and configure only the dedicated test database.',
  );
  process.exit(1);
}

console.log(`Verified isolated MongoDB test database: ${databaseName}`);
const jestPath = path.resolve(__dirname, '..', 'node_modules', 'jest', 'bin', 'jest.js');
const result = spawnSync(
  process.execPath,
  [
    jestPath,
    '--runInBand',
    '--runTestsByPath',
    'src/integration-tests/stage4.integration.test.js',
  ],
  {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error('Unable to start the Stage 4 integration test runner.');
  process.exitCode = 1;
} else {
  process.exitCode = result.status === null ? 1 : result.status;
}
