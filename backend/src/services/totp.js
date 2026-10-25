async function createProvisioningSecret(label) {
  const { generateSecret, generateURI } = await import('otplib');
  const secret = generateSecret();

  return {
    secret,
    uri: generateURI({
      issuer: 'TrustVault',
      label,
      secret,
    }),
  };
}

async function verifyCode(secret, token, afterTimeStep = -1) {
  const { verify } = await import('otplib');
  const options = {
    secret,
    token,
    epochTolerance: 30,
  };
  if (afterTimeStep >= 0) {
    options.afterTimeStep = afterTimeStep;
  }
  const result = await verify({
    ...options,
  });
  return result.valid ? result : null;
}

module.exports = { createProvisioningSecret, verifyCode };
