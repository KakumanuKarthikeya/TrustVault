# TrustVault threat notes

## Current scope

This stage provides an Express health endpoint, MongoDB connection,
authentication, private document APIs, and owner-only permission management.
Persistent audit records are not implemented.

| Threat | Current mitigation or status |
| --- | --- |
| Connection details exposed in an HTTP response or startup log | The health response reports only connected/disconnected status. Startup errors log the error type and a generic remediation hint, not the connection string or driver message. |
| Service starts without its database | Startup requires a non-empty `MONGODB_URI` and a successful MongoDB connection. The health endpoint returns `503` when disconnected. |
| Browser-based cross-origin access to the API | Helmet is enabled. CORS permits only exact origins listed in `CORS_ORIGINS`; an empty setting permits no browser origin. CORS is not authentication or authorization. |
| Public health endpoint reveals operational status | Accepted for this initial readiness check; it reveals only whether the database is connected. Review whether deployment monitoring requires network-level restriction before public deployment. |
| Database credential committed to source | `.env` is ignored by Git and `.env.example` contains no credentials. Operators must keep the actual URI private. |
| Plaintext password disclosure or storage | Registration hashes passwords with bcrypt (12 rounds). The schema excludes hashes by default, and API responses use an explicit public-user shape. |
| Public administrator creation | Registration schema rejects extra fields; controller hard-codes role `owner`. Administrator provisioning must be handled by a separate trusted process. |
| Email enumeration on login | Unknown email, wrong password, and disabled account share the same `401` response. A dummy bcrypt comparison is performed for unknown emails to reduce timing differences. |
| Guessable or long-lived access token | JWT uses HS256, a configured signing key of at least 32 bytes, issuer/audience checks, and a 15-minute expiration. |
| Repeated login or registration attempts | Each authentication route has a per-IP limit of 10 requests per 15-minute window. Production deployments behind proxies must configure Express trusted-proxy settings carefully before relying on client IP rate limits. |
| Disabled account continuing to authenticate | `/me` loads the account from MongoDB each time and rejects non-active accounts. A token otherwise remains valid until expiry; there is no token denylist or logout yet. |
| Request injection or unexpected registration fields | Zod validates and normalizes request bodies; schemas reject unknown keys. |
| Caller-supplied role used to escalate privileges | `authorizeRoles` checks the active database-loaded `request.user`; it does not read role claims from client input or JWT claims. Public registration continues to reject extra fields and assigns `owner`. |
| Cross-user document access / IDOR | Document-access middleware loads the document using its route ID, compares its stored owner ID, and checks a persisted permission for other users. Owner-only grant/revoke routes validate user IDs and access values. Missing or malformed documents fail closed. |
| Read permission used for writes | A `read` grant only satisfies read checks. Edit checks require an `edit` grant; edit grants also confer read access. |
| Admin role bypassing document permission rules | No implicit admin bypass exists in document checks. An admin must also own the document or receive an explicit grant unless a future route deliberately defines a separately reviewed policy. |
| Public exposure or path traversal through uploaded files | Uploads use bounded memory parsing, server-generated random storage keys, a private non-static directory, key format/path checks, filename validation, and attachment download only after an access check. |
| File type spoofing or oversized uploads | Uploads are capped at 5 MiB, limited to one file, require an allowlisted extension and matching declared MIME, and validate PDF/PNG/JPEG signature bytes. |
| Unauthorized or stale download links | No permanent file URLs are generated. The document and current permission are checked from the database on each download request. |
| Revoked permission remains usable | There is no document-permission cache. Each protected request checks the current grant, so requests after revocation fail authorization. |
| Metadata mass assignment | The metadata schema is strict and only updates `name`, `category`, and `description`; ownership, storage key, file bytes, MIME type, and size are not client-editable. |
| Deletion across MongoDB and filesystem | Database deletion and filesystem removal are not a single atomic operation. A filesystem failure after record deletion may leave an inaccessible private orphan requiring operational cleanup. |
| Missing audit records | No audit-log infrastructure exists. Controllers and authorization middleware have explicit integration points for successful document events and denied access, but activity and denied attempts are not currently persisted. |

## Verification

The current Jest tests exercise the HTTP readiness response while MongoDB is
disconnected and reject an empty connection string before connecting. These
checks do not verify access to a live Atlas deployment. Auth, authorization,
and document API tests use Supertest with mocked persistence; they exercise
routes/middleware, permission grant/revoke behavior, immediate authorization
rechecks, upload validation, safe storage-key handling, and file limits, but do
not prove live MongoDB behavior or deployed database indexes.

## Accepted risks and future work

This service is not ready for production use: it has no persistent audit trail,
logout/revocation denylist, or cross-resource filesystem/database transaction.
The MongoDB Atlas network access policy,
private storage backup/cleanup, and credential rotation are deployment
responsibilities. Reassess this threat model before deployment.
