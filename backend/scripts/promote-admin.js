require('dotenv').config();

const { createInterface } = require('node:readline/promises');
const mongoose = require('mongoose');
const AuditLog = require('../src/models/AuditLog');
const User = require('../src/models/User');
const { connectDatabase } = require('../src/config/database');

const BOOTSTRAP_ID = 'initial-admin';

class AdminBootstrapError extends Error {}

async function promoteFirstAdmin(
  email,
  {
    UserModel = User,
    bootstrapCollection = mongoose.connection.db.collection('admin_bootstrap'),
  } = {},
) {
  const normalizedEmail =
    typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new AdminBootstrapError('Enter a valid account email address.');
  }

  const user = await UserModel.findOne({ email: normalizedEmail }).select(
    '_id role status',
  );
  if (!user) {
    throw new AdminBootstrapError(
      'No account with that email exists. Register or verify the email, then retry.',
    );
  }
  if (user.status !== 'active') {
    throw new AdminBootstrapError('The account is not active; no changes made.');
  }

  const claim = await bootstrapCollection.findOne({ _id: BOOTSTRAP_ID });
  const claimIsForUser =
    claim && String(claim.userId) === String(user._id);

  if (user.role === 'admin') {
    if (claimIsForUser && claim.state === 'pending') {
      await bootstrapCollection.updateOne(
        { _id: BOOTSTRAP_ID, userId: user._id, state: 'pending' },
        { $set: { state: 'completed', completedAt: new Date() } },
      );
    }
    return { alreadyAdmin: true };
  }

  const adminCount = await UserModel.countDocuments({ role: 'admin' });
  if (adminCount > 0) {
    throw new AdminBootstrapError(
      'An administrator already exists. Use an existing administrator to manage roles.',
    );
  }
  if (claim && (!claimIsForUser || claim.state !== 'pending')) {
    throw new AdminBootstrapError(
      'The one-time administrator bootstrap has already been used.',
    );
  }

  if (!claim) {
    try {
      await bootstrapCollection.insertOne({
        _id: BOOTSTRAP_ID,
        userId: user._id,
        state: 'pending',
        createdAt: new Date(),
      });
    } catch (error) {
      if (error && error.code === 11000) {
        throw new AdminBootstrapError(
          'Another administrator bootstrap is in progress or has already been used.',
        );
      }
      throw error;
    }
  }

  const result = await UserModel.updateOne(
    {
      _id: user._id,
      status: 'active',
      role: { $in: ['owner', 'viewer'] },
    },
    { $set: { role: 'admin' } },
  );
  if (result.modifiedCount !== 1) {
    throw new AdminBootstrapError(
      'The account changed during bootstrap. No promotion was confirmed.',
    );
  }

  await bootstrapCollection.updateOne(
    { _id: BOOTSTRAP_ID, userId: user._id, state: 'pending' },
    { $set: { state: 'completed', completedAt: new Date() } },
  );

  await AuditLog.create({
    actorUserId: null,
    action: 'auth.admin.bootstrap',
    targetUserId: user._id,
    outcome: 'success',
  });

  return { alreadyAdmin: false };
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new AdminBootstrapError(
      'Run this command from an interactive terminal to confirm the account.',
    );
  }

  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const email = (await prompt.question('Existing account email: '))
      .trim()
      .toLowerCase();
    const confirmation = await prompt.question(
      `Type PROMOTE ${email} to confirm: `,
    );
    if (confirmation !== `PROMOTE ${email}`) {
      throw new AdminBootstrapError('Confirmation did not match; no changes made.');
    }

    await connectDatabase();
    const result = await promoteFirstAdmin(email);
    if (result.alreadyAdmin) {
      console.log('This account is already an administrator.');
      return;
    }

    console.log(
      'Administrator role granted to the existing account. Sign out and sign in again to refresh the session.',
    );
  } finally {
    prompt.close();
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    if (error instanceof AdminBootstrapError) {
      console.error(error.message);
    } else {
      console.error(
        'Administrator bootstrap failed. Verify database availability; sensitive connection details are withheld.',
      );
    }
    process.exitCode = 1;
  });
}

module.exports = { AdminBootstrapError, promoteFirstAdmin };
