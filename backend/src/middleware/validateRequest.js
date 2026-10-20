function validateRequest(schema) {
  return (request, response, next) => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      return response.status(400).json({ error: 'Invalid request body' });
    }

    request.body = result.data;
    return next();
  };
}

module.exports = validateRequest;
