# AI interaction log

This file records actual interactions and verification performed in this
workspace. No commit hashes are listed because no commits have been created.

## 2026-10-20 — Backend health and MongoDB connection

- **Prompt summary:** Inspect the existing backend and implement a health
  endpoint and MongoDB connection.
- **Observed correction:** The first file patch treated empty `src/config` and
  `src/models` placeholders as directories; inspection found they were files.
  The placeholders were replaced with directories before adding source.
- **Verification:** The health test and missing-URI database test passed in
  Jest. A live Atlas connection was later attempted and failed with a
  sanitized MongoDB error; Atlas connectivity was not established.

## 2026-10-20 — Authentication

- **Prompt summary:** Add user registration, login, and protected `/me` while
  reusing the existing Express/Mongoose project.
- **Observed correction:** The first auth test run failed because an assertion
  expected the original mixed-case email instead of the normalized lowercase
  value. The expected value was corrected.
- **Verification:** `npm test` passed: 3 suites, 10 tests.

## 2026-10-20 — Authorization

- **Prompt summary:** Add server-side role and document access middleware with
  security tests, without uploads or rewritten authentication.
- **Observed correction:** No implementation mistake was identified during
  this stage.
- **Verification:** `npm test` passed: 4 suites, 19 tests.

## 2026-10-20 — Document APIs

- **Prompt summary:** Add private document upload, search/list, metadata,
  download, update, deletion, authorization, and security tests.
- **Observed correction:** Supertest's multipart helper normalized the
  traversal-style filename in the attempted API test. The filename traversal
  assertion was moved to the direct filename validator, while HTTP tests
  remained for file type, size, access, and document operations.
- **Verification:** `npm test` passed: 7 suites, 33 tests. The API tests mock
  MongoDB persistence and storage; a live Atlas connection was not verified.

## 2026-10-20 — Single-repository project inspection and frontend setup

- **Prompt summary:** Inspect local project and Git configuration before
  creating a React/Vite frontend and root-level repository documentation.
- **Observed output:** The local repository had no commits or `origin`, was on
  `master`, and contained an untracked `backend/`. The explicit read-only
  GitHub refs check returned no refs. The user initially reported
  `fatal: No remote configured to list refs from.` when attempting the probe.
- **Approval and scope:** The user approved local-only file setup. Branch,
  remote, commit, and push operations remain untouched.
- **Verification:** Pending.
