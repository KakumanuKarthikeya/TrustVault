# TrustVault security notes

## Current controls

- Passwords are hashed with bcrypt. Public registration assigns `owner` and
  rejects caller-supplied roles.
- JWTs are short-lived; protected routes resolve active users server-side.
- Document access is checked against stored ownership and permission records;
  read and edit permissions are distinct.
- Uploads are bounded to 5 MiB, restricted to PDF/PNG/JPEG, and checked against
  file signatures. Server-generated storage keys are used in private storage.
- Files are not served from a static directory. Downloads repeat the
  authorization check and return `Cache-Control: private, no-store`.
- API request metadata uses allowlisted fields to limit mass assignment.
- Root `.gitignore` excludes environment files, dependencies, private uploads,
  build output, and test coverage while allowing `.env.example`.

## Tests

The backend Jest/Supertest suite currently includes auth, health,
authorization, document API, upload validation, storage helper, and database
configuration tests. The latest observed result before frontend setup was
7 suites and 33 passing tests. The document API tests mock persistence and
storage, so they do not prove live Atlas behavior.

## Known gaps and accepted risks

- Permission-grant/revoke endpoints and persistent audit history are not
  implemented. Corresponding frontend pages are informational placeholders.
- Frontend bearer tokens are kept in `sessionStorage`; this limits persistence
  but remains accessible to same-origin JavaScript and therefore vulnerable to
  token theft if an XSS flaw occurs.
- Browser logout clears local token state but cannot revoke a token server-side.
- File signature checks are basic format checks, not malware scanning or
  complete document parsing.
- Database record deletion and filesystem removal cannot be atomic; cleanup
  and reconciliation are operational requirements.
- No production deployment or live MongoDB Atlas connection has been verified.
- The local Git repository currently has no commits and no configured remote.
  Do not push until the local and GitHub repository state is reviewed and the
  project owner explicitly approves the integration plan.
