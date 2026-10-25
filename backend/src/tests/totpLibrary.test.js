const { execFileSync } = require('node:child_process');

test('otplib creates interoperable six-digit TOTP codes and prevents reuse by time step', () => {
  const script = `
    (async () => {
      const otp = await import('otplib');
      const secret = otp.generateSecret();
      const token = await otp.generate({ secret });
      const valid = await otp.verify({ secret, token, epochTolerance: 30 });
      const invalid = await otp.verify({ secret, token: '000000', epochTolerance: 30 });
      const expiredToken = await otp.generate({
        secret,
        epoch: Math.floor(Date.now() / 1000) - 120,
      });
      const expired = await otp.verify({
        secret,
        token: expiredToken,
        epochTolerance: 30,
      });
      const replay = await otp.verify({
        secret,
        token,
        epochTolerance: 30,
        afterTimeStep: valid.timeStep,
      });
      const uri = otp.generateURI({ issuer: 'TrustVault', label: 'user@example.test', secret });
      process.stdout.write(JSON.stringify({
        tokenLength: token.length,
        valid: valid.valid,
        invalid: invalid.valid,
        expired: expired.valid,
        replay: replay.valid,
        uri: uri.startsWith('otpauth://totp/'),
      }));
    })().catch(() => process.exit(1));
  `;
  const result = JSON.parse(execFileSync(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }));

  expect(result).toEqual({
    tokenLength: 6,
    valid: true,
    invalid: false,
    expired: false,
    replay: false,
    uri: true,
  });
});
