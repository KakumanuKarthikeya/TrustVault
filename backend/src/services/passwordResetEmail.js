const { Resend } = require('resend');

function getConfiguration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const frontendUrl = process.env.FRONTEND_URL?.trim();

  if (!apiKey || !from || !frontendUrl) {
    return null;
  }

  let resetUrl;
  try {
    resetUrl = new URL('/reset-password', frontendUrl);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(resetUrl.protocol)) {
    return null;
  }

  return { apiKey, from, resetUrl };
}

function isConfigured() {
  return getConfiguration() !== null;
}

async function sendPasswordResetEmail(email, token) {
  const configuration = getConfiguration();
  if (!configuration) {
    throw new Error('Password reset email is not configured');
  }

  const resetUrl = new URL(configuration.resetUrl);
  resetUrl.searchParams.set('token', token);
  try {
    const resend = new Resend(configuration.apiKey);
    const { error } = await resend.emails.send({
      from: configuration.from,
      to: email,
      subject: 'Reset your TrustVault password',
      text: [
        'A password reset was requested for your TrustVault account.',
        '',
        `Use this link within 30 minutes to choose a new password: ${resetUrl.toString()}`,
        '',
        'If you did not request this, you can ignore this email.',
      ].join('\n'),
    });
    if (error) {
      throw new Error('Provider rejected the email');
    }
  } catch {
    throw new Error('Password reset email delivery failed');
  }
}

module.exports = { isConfigured, sendPasswordResetEmail };
