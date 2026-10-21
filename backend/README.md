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

Document APIs are mounted at `/api/documents`. Uploads accept PDF, PNG, or JPEG
files up to 5 MiB. The private storage directory defaults to
`backend/private-uploads` and is not mounted as static content. See [API.md](./API.md)
for routes and authorization requirements.

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
