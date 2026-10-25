const {
  assertStage4TestDatabase,
} = require('../../scripts/stage4TestDatabase');

describe('Stage 4 integration database guard', () => {
  const validUri = 'mongodb://127.0.0.1:27018/trustvault_stage4_test';

  test('requires an explicit exact database confirmation', () => {
    expect(
      assertStage4TestDatabase(validUri, 'trustvault_stage4_test'),
    ).toBe('trustvault_stage4_test');
    expect(() =>
      assertStage4TestDatabase(validUri, 'trustvault_production'),
    ).toThrow('Set TRUSTVAULT_TEST_DATABASE_CONFIRM');
  });

  test.each([
    '',
    'mongodb://127.0.0.1:27017/trustvault',
    'mongodb://127.0.0.1:27017/trustvault_production',
    'http://127.0.0.1:27018/trustvault_stage4_test',
    'mongodb://127.0.0.1:27018/other_stage4_test',
  ])('refuses unsafe test target %s', (uri) => {
    expect(() =>
      assertStage4TestDatabase(uri, 'trustvault_stage4_test'),
    ).toThrow();
  });
});
