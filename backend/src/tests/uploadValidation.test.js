const {
  detectAllowedFile,
  validateOriginalFilename,
} = require('../utils/uploadValidation');

describe('document upload validation', () => {
  it('rejects path traversal and control characters in original filenames', () => {
    expect(validateOriginalFilename('../private.pdf')).toBeNull();
    expect(validateOriginalFilename('..\\private.pdf')).toBeNull();
    expect(validateOriginalFilename('bad\u0000name.pdf')).toBeNull();
  });

  it('requires both an allowlisted extension and matching file signature', () => {
    const pdf = Buffer.from('%PDF-1.7\ncontent');

    expect(
      detectAllowedFile({
        originalname: 'file.pdf',
        mimetype: 'application/pdf',
        buffer: pdf,
      }),
    ).toEqual({
      filename: 'file.pdf',
      extension: '.pdf',
      mimeType: 'application/pdf',
    });
    expect(
      detectAllowedFile({
        originalname: 'file.png',
        mimetype: 'image/png',
        buffer: pdf,
      }),
    ).toBeNull();
  });
});
