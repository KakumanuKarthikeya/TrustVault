# TrustVault backend

The backend currently provides an Express health endpoint, MongoDB connection,
authentication APIs, protected document management, permission management,
and persistent security audit logging.

## Requirements

- Node.js
- A MongoDB Atlas connection string and an Atlas network access rule that
  permits your development machine

## Local setup

From PowerShell:

```powershell
Set-Location .\backend
Copy-Item .env.example .env
```

Set `MONGODB_URI` in `.env` to your Atlas connection string. Do not commit or
share `.env`. Set `JWT_SECRET` to a private random value of at least 32 bytes.
Do not use the example file as a source of production secrets. The application
fails to start if MongoDB is unavailable; authentication APIs return a safe
`503` if the signing secret is missing or too short.
Startup failures identify whether connection or index initialization failed
and may include a sanitized error code. Connection strings and error messages
are not logged; TLS verification is always enabled.

Start in development mode:

```powershell
npm run dev
```

Run the current tests:

```powershell
npm test
```

The health endpoint is `GET http://localhost:3000/health`. It returns `200`
with `{"status":"ok","database":"connected"}` when MongoDB is connected, and
`503` with `{"status":"unavailable","database":"disconnected"}` otherwise.
The endpoint reports readiness only; it does not expose database details.

Authentication endpoints:

- `POST /api/auth/register` creates a regular owner account. Public
  registration rejects extra fields such as `role`; it cannot create admins.
- `POST /api/auth/login` issues a 15-minute access token.
- `POST /api/auth/logout` requires an access token and revokes only that
  session. Revocation records persist in MongoDB across server restarts.
- `GET /api/auth/me` requires `Authorization: Bearer <token>`.

### Initial administrator setup

Public registration always creates an `owner` and rejects a supplied `role`.
To promote an existing active account, run the one-time bootstrap from the
`backend` directory:

```powershell
npm run promote-admin
```

Enter the account's existing email and then type the displayed
`PROMOTE <email>` confirmation. The command changes only that account's role;
it does not change its email or password. It works only when no administrator
exists, and a database uniqueness claim prevents concurrent or subsequent
bootstrap attempts from promoting another account. The operation is recorded
in the audit history. Do not run the command unless you intend to grant admin
access to that account.

After success, sign out and sign back in. Verify the account's role through
`GET /api/auth/me`, then open Audit History. The backend checks the account's
current database role for every request; JWT role claims are not used for
authorization.

Document APIs are mounted at `/api/documents`. Uploads accept PDF, PNG, or JPEG
files up to 5 MiB. The private storage directory defaults to
`backend/private-uploads` and is not mounted as static content. See [API.md](./API.md)
for routes and authorization requirements. Authenticated users can look up an
active recipient by exact email through the rate-limited `/api/users/lookup`
endpoint. Only document owners can grant or revoke that document's access.

The `/admin` dashboard and user-management APIs require the current database
role to be `admin`. Admins can review sanitized account records and disable or
reactivate non-admin accounts; admin accounts cannot be disabled through the
management API. Audit history supports server-side action and date filters.

Registration and login require MongoDB to be reachable. Never send secrets in
chat or commit `.env`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string; required |
| `PORT` | HTTP port; defaults to `3000` |
| `CORS_ORIGINS` | Comma-separated exact browser origins allowed by CORS; empty disables cross-origin browser access |
| `JWT_SECRET` | Private signing key; authentication requires at least 32 bytes |
| `PRIVATE_UPLOAD_DIR` | Optional private storage directory; defaults to `backend/private-uploads` and must not be inside `backend/public` |
| `FRONTEND_URL` | Frontend origin used to build password-reset links |
| `RESEND_API_KEY` | Resend API key; required to send reset emails |
| `EMAIL_FROM` | Sender address or name/address using a domain verified in Resend |

Password reset is enabled only when `FRONTEND_URL`, `RESEND_API_KEY`, and
`EMAIL_FROM` are configured. Verify the sender's domain in Resend before
using it; for example, `TrustVault <no-reply@your-verified-domain.example>`.
Use an HTTPS `FRONTEND_URL` in production. Without valid email configuration,
`POST /api/auth/forgot-password`
returns `503` and does not create a reset token. Reset tokens are random,
single-use, expire after 30 minutes, and only their SHA-256 hashes are stored.
The request endpoint is limited to 10 attempts per IP in 15 minutes and the
confirmation endpoint to 10 attempts per IP in 15 minutes; responses do not
reveal whether an email belongs to an account.

For local setup, create a Resend account, add and verify your sending domain
in its dashboard, and create an API key with permission to send email. In
`backend/.env`, set `RESEND_API_KEY` to that key and `EMAIL_FROM` to an address
on the verified domain. Set `FRONTEND_URL` to the origin where the frontend is
running. Restart the backend after changing `.env`. Do not commit or share the
API key; `.env.example` contains placeholders only.

## Verify against a real MongoDB database

The Jest suite uses mocked models for API persistence; it does not prove Atlas
connectivity. To verify a real deployment:

1. Copy `.env.example` to `.env`. Set `MONGODB_URI` to a test database URI and
   `JWT_SECRET` to a private random value of at least 32 bytes. Never paste
   credentials into chat or commit `.env`.
2. Permit the development machine's current IP in the MongoDB network access
   policy and use a database user limited to the test database.
3. From `backend/`, run `npm run dev`. Startup must complete database
   connection and creation of the unique permission, password-reset, and token-revocation
   indexes before the HTTP listener starts. An index-build failure prevents
   startup.
4. In another PowerShell window, run
   `Invoke-RestMethod http://localhost:3000/health` and confirm
   `status = ok` and `database = connected`.
5. Register/login with test accounts. Keep each returned token in a local
   PowerShell variable; call `GET /api/auth/me`, then `POST /api/auth/logout`
   with one token and verify that the same token receives `401` on `/me` while
   a separately issued token still succeeds.
6. In `mongosh`, connected to that same test database, inspect
   `db.permissions.getIndexes()` and `db.tokenrevocations.getIndexes()`.
   Confirm the unique `(documentId, userId)` permission index, unique
   `tokenIdHash` index, and TTL `expiresAt` index exist.
7. With test owner and recipient accounts, upload a harmless test PDF, grant
   edit access, verify allowed read/download/update, revoke the grant, and
   verify subsequent read/download/update requests are denied. Delete remains
   owner-only before and after revocation.

## Current limitations

There are no seed accounts or deployment configuration. Access tokens remain
valid until their 15-minute expiration unless revoked or the account is
disabled; protected routes check account status and revocation in MongoDB.
Logout writes the revocation record before its audit event. If the audit write
fails, the endpoint returns an error even though the token has already been
revoked. Audit writes use the application MongoDB connection and are awaited.
An audit-write failure prevents a success response; upload failure triggers
best-effort removal of the newly created document and file. For updates,
downloads, deletions, and permission changes, the primary operation may already
have taken effect before a later audit insert fails, so a `500` does not prove
that the operation was rolled back. MongoDB/filesystem operations and audit
inserts are not transactional here. Downloads are logged when authorized
streaming is initiated, not after the client confirms full receipt. Do not treat
this hackathon backend as production-ready without a deployment-specific
security review.
