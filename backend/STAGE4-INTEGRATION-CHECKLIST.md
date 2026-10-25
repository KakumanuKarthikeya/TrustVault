# Stage 4 Integration Testing Checklist

The regular automated API tests use Supertest with isolated model fixtures and
mocks. The opt-in `npm run test:integration` suite uses a real, isolated
MongoDB database named exactly `trustvault_stage4_test`; it requires a matching
explicit confirmation value. It creates unique test accounts and removes only
data tied to those account IDs. No suite drops the database or collections.
Do not run data-mutating scenarios against production or a developer's
real-user database.

| # | Scenario | Existing automated coverage | Status / remaining verification |
|---|---|---|---|
| 1 | Signup with valid data | `src/tests/auth.test.js`: normalized email, bcrypt hash, owner role, public response | Covered with isolated fixtures |
| 2 | Signup with duplicate email | `src/tests/auth.test.js`: duplicate registration conflict | Covered with isolated fixtures |
| 3 | Login with valid and invalid credentials | `src/tests/auth.test.js`: success, wrong password, invalid input | Covered with isolated fixtures |
| 4 | JWT-protected API access | `src/tests/auth.test.js`, `src/tests/authorization.test.js`: `/me`, malformed/expired tokens, protected routes | Covered with isolated fixtures |
| 5 | Logout and token revocation | `src/tests/auth.test.js`, `src/tests/tokenRevocation.test.js`: revocation and token-index schema | Covered with isolated fixtures |
| 6 | Frontend-backend API communication | `frontend/src/services/api.js` targets port 5000; `src/tests/integrationBoundary.test.js` validates CORS preflight | Local preflight verified; browser-driven login/request flow remains manual |
| 7 | MongoDB persistence and retrieval | `src/tests/database.test.js` verifies connection/index setup; `src/integration-tests/stage4.integration.test.js` reads the registered account back from MongoDB | Real persistence is covered only when opt-in suite is run with the dedicated test database |
| 8 | Admin-only routes and unauthorized access | `src/tests/admin.test.js`, `src/tests/auditLog.test.js`: current-role admin checks and owner/anonymous denials | Covered with isolated fixtures |
| 9 | Password change and old/new password behavior | `src/tests/changePassword.test.js`: current password, replacement token, old-token invalidation, old/new password checks | Covered with isolated fixtures |
| 10 | 2FA setup, QR generation, OTP verification, and 2FA login | `src/tests/twoFactor.test.js`, `src/tests/totpCrypto.test.js`, `src/tests/totpLibrary.test.js`, `src/integration-tests/stage4.integration.test.js` | Backend OTP flows covered when integration suite runs; browser QR rendering and authenticator-app scan remain manual |
| 11 | Invalid input, rate limits, and server errors | Auth, upload, password reset, change-password, and 2FA tests; `src/tests/integrationBoundary.test.js` checks malformed JSON sanitization | Covered by API fixtures; provider is mocked; live provider failures are not exercised |
| 12 | CORS and environment configuration | `src/tests/integrationBoundary.test.js`; `src/tests/database.test.js` and `src/tests/totpCrypto.test.js` validate configuration guards | Local frontend CORS preflight verified. Deployment-specific environment values and origins require operator verification |

## Safe execution

Run automated checks from the repository root:

```powershell
Set-Location .\backend
npm test
Set-Location ..\frontend
npm run build
```

For database-backed integration, follow the isolated test database setup in
`README.md`. The runner refuses to start unless the URI names exactly
`trustvault_stage4_test` and `TRUSTVAULT_TEST_DATABASE_CONFIRM` matches. Tests
generate unique fixture credentials at runtime, mock email delivery, and only
clean up rows linked to generated account IDs.

## Manual browser checks still required

Use a dedicated disposable test account and test database:

1. From the frontend on port 5173, register, log in, reload, and confirm `/me`
   loads the persisted account.
2. Sign out and verify the same token is rejected; verify the frontend clears
   its session on the resulting 401.
3. As a regular owner, verify admin pages and audit history are denied; repeat
   with a dedicated admin test account.
4. Change the test account password, verify the old password fails and the new
   password succeeds.
5. Enroll 2FA, scan the displayed QR with a test authenticator, verify setup,
   log in with a valid OTP, and verify invalid/replayed OTPs are rejected.
6. Inspect the browser network panel to confirm requests target port 5000, the
   configured CORS origin is accepted, and no secrets appear in responses or
   console output.

Do not consider Stage 4 end-to-end testing complete until the isolated
MongoDB-backed and browser flows above have been run and recorded.
