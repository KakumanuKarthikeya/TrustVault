# AI interaction record

## 2026-10-21 — Final backend security/integration review

- **Request:** Review authentication, authorization, permissions, audit logging,
  file handling, validation, secrets, MongoDB, documentation, and security
  tests. Keep changes inside `backend/` and do not modify the frontend.
- **Findings addressed:** Root-level project documentation was reported stale
  but left unchanged because the requested edit scope was backend-only. Backend
  docs now include exact real-MongoDB verification steps. Database startup
  explicitly builds unique permission and token-revocation indexes and closes
  the connection if index setup fails. Tests cover index startup/failure,
  fail-closed revocation-store errors, malformed signed tokens, and accurately
  distinguish owner-only deletion from permission revocation.
- **Verification:** `npm test` passed: 9 suites, 54 tests. `git diff --check`
  passed. `.env` and private-upload paths are ignored and not tracked;
  `.env.example` contains only blank configuration assignments.
- **Not verified:** No live MongoDB/Atlas connection, deployed index inspection,
  production configuration, or frontend logout integration was tested.
- **Commit:** None.

## 2026-10-20 — Initial health endpoint and MongoDB setup

- **Request:** Inspect the existing backend and implement the initial health
  endpoint and MongoDB connection without building a frontend.
- **What the AI got wrong:** The initial file-writing attempt assumed
  `src/config` and `src/models` were directories. Inspection showed they were
  empty files, so the patch could not create a file under `src/config`.
- **Correction and verification:** Confirmed the empty files, removed those
  placeholders, created the intended directories, and applied the implementation.
  `npm test` subsequently passed the health endpoint test. A separate live Atlas
  connection has not been verified.
- **Actual commit link:** Not available; this workspace is not a Git repository.

## 2026-10-20 — Document permission grants and revocations

- **Request:** Add owner-only APIs for read/edit grants and permission
  revocation; validate users and permissions and prove revocation takes effect
  on subsequent document requests.
- **What the AI got wrong:** The first test run returned `404` for grant tests
  because the owner-only middleware correctly requires an existing document.
  The test fixtures were updated to create that document.
- **Verification:** `npm test` passed: 7 suites, 40 tests. Permission API tests
  use mocked persistence; live Atlas behavior has not been verified.
- **Actual commit link:** Not available; this workspace is not a Git repository.

## 2026-10-20 — Private document management APIs

- **Request:** Add private document uploads, scoped list/search, metadata,
  downloads, updates, deletion, authorization, and API security tests.
- **What the AI got wrong:** The first path traversal test used Supertest's
  multipart helper, which normalized the filename before sending it. The test
  was moved to the filename validator directly; the HTTP invalid-type test
  remains API-level.
- **Verification:** `npm test` passed: 7 suites, 33 tests. The API tests mock
  persistence and storage; live Atlas connectivity has not been verified.
- **Actual commit link:** Not available; this workspace is not a Git repository.

## 2026-10-20 — Server-side authorization

- **Request:** Add reusable role and document permission middleware and
  Supertest coverage without rewriting authentication or adding upload routes.
- **What the AI got wrong:** No implementation mistake has been identified
  during this stage.
- **Verification:** `npm test` passed: 4 suites, 19 tests. Authorization tests
  use mocked database models and do not verify live MongoDB behavior.
- **Actual commit link:** Not available; this workspace is not a Git repository.

## 2026-10-20 — Initial authentication module

- **Request:** Add a Mongoose user model and registration, login, and protected
  current-user APIs with input validation, password hashing, JWTs, and API tests.
- **What the AI got wrong:** No implementation mistake has been identified
  during this stage.
- **Verification:** `npm test` passed: 3 suites, 10 tests. Tests use isolated
  mocked persistence and do not verify live Atlas connectivity.
- **Actual commit link:** Not available; this workspace is not a Git repository.
