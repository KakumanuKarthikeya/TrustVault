const { z } = require('zod');
const User = require('../models/User');

const lookupSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  })
  .strict();

async function lookup(request, response, next) {
  const input = lookupSchema.safeParse(request.query);
  if (!input.success) {
    return response.status(400).json({ error: 'Enter a valid email address' });
  }

  try {
    const user = await User.findOne({
      email: input.data.email,
      status: 'active',
      _id: { $ne: request.user._id },
    }).select('_id name email');

    if (!user) {
      return response.status(404).json({ error: 'No active account found for that email' });
    }

    return response.status(200).json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { lookup };
