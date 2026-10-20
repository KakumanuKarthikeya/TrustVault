function errorHandler(error, _request, response, _next) {
  if (response.headersSent) {
    return;
  }

  if (error && error.code === 11000) {
    response.status(409).json({ error: 'Resource conflict' });
    return;
  }

  if (error && error.code === 'LIMIT_FILE_SIZE') {
    response.status(413).json({ error: 'Uploaded file is too large' });
    return;
  }

  if (
    error &&
    [
      'LIMIT_FILE_COUNT',
      'LIMIT_FIELD_COUNT',
      'LIMIT_FIELD_KEY',
      'LIMIT_FIELD_VALUE',
      'LIMIT_PART_COUNT',
      'LIMIT_UNEXPECTED_FILE',
    ].includes(error.code)
  ) {
    response.status(400).json({ error: 'Invalid document upload' });
    return;
  }

  if (error && (error.status === 400 || error.status === 413)) {
    response
      .status(error.status)
      .json({ error: error.status === 413 ? 'Request too large' : 'Invalid request' });
    return;
  }

  response.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
