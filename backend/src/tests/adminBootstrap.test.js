jest.mock('../models/AuditLog', () => ({
  create: jest.fn(),
}));

const AuditLog = require('../models/AuditLog');
const {
  AdminBootstrapError,
  promoteFirstAdmin,
} = require('../../scripts/promote-admin');

function createBootstrapDependencies({
  role = 'owner',
  status = 'active',
  adminCount = 0,
  existingClaim = null,
} = {}) {
  const user = {
    _id: '64b000000000000000000001',
    role,
    status,
  };
  let claim = existingClaim;
  const UserModel = {
    findOne: jest.fn(() => ({
      select: jest.fn().mockResolvedValue(user),
    })),
    countDocuments: jest.fn().mockResolvedValue(adminCount),
    updateOne: jest.fn(async () => {
      user.role = 'admin';
      return { modifiedCount: 1 };
    }),
  };
  const bootstrapCollection = {
    findOne: jest.fn(async () => claim),
    insertOne: jest.fn(async (document) => {
      claim = document;
    }),
    updateOne: jest.fn(async (_filter, update) => {
      claim = { ...claim, ...update.$set };
    }),
  };

  return { UserModel, bootstrapCollection, user };
}

describe('one-time administrator bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuditLog.create.mockResolvedValue({});
  });

  it('promotes only the existing active account and records the bootstrap', async () => {
    const dependencies = createBootstrapDependencies();

    const result = await promoteFirstAdmin(
      ' Existing.User@example.com ',
      dependencies,
    );

    expect(result).toEqual({ alreadyAdmin: false });
    expect(dependencies.UserModel.findOne).toHaveBeenCalledWith({
      email: 'existing.user@example.com',
    });
    expect(dependencies.user).toMatchObject({
      role: 'admin',
      status: 'active',
    });
    expect(dependencies.bootstrapCollection.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'initial-admin',
        userId: dependencies.user._id,
        state: 'pending',
      }),
    );
    expect(dependencies.bootstrapCollection.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'pending' }),
      expect.objectContaining({
        $set: expect.objectContaining({ state: 'completed' }),
      }),
    );
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.admin.bootstrap',
        targetUserId: dependencies.user._id,
        outcome: 'success',
      }),
    );
  });

  it('does not promote another account when an administrator already exists', async () => {
    const dependencies = createBootstrapDependencies({ adminCount: 1 });

    await expect(
      promoteFirstAdmin('user@example.com', dependencies),
    ).rejects.toThrow(AdminBootstrapError);
    expect(dependencies.UserModel.updateOne).not.toHaveBeenCalled();
    expect(dependencies.bootstrapCollection.insertOne).not.toHaveBeenCalled();
  });

  it('does not promote an inactive account', async () => {
    const dependencies = createBootstrapDependencies({ status: 'disabled' });

    await expect(
      promoteFirstAdmin('user@example.com', dependencies),
    ).rejects.toThrow('The account is not active');
    expect(dependencies.UserModel.updateOne).not.toHaveBeenCalled();
  });

  it('does not allow the one-time claim to target a second account', async () => {
    const dependencies = createBootstrapDependencies({
      existingClaim: {
        _id: 'initial-admin',
        userId: '64b000000000000000000099',
        state: 'completed',
      },
    });

    await expect(
      promoteFirstAdmin('user@example.com', dependencies),
    ).rejects.toThrow('one-time administrator bootstrap has already been used');
    expect(dependencies.UserModel.updateOne).not.toHaveBeenCalled();
  });
});
