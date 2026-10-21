# TrustVault threat notes

## Current scope

This stage provides an Express health endpoint, MongoDB connection,
authentication, private document APIs, owner-only permission management, and
persistent audit records.

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
| Guessable or long-lived access token | JWT uses HS256, a configured signing key of at least 32 bytes, issuer/audience checks, a cryptographically random token ID, and a 15-minute expiration. |
| Repeated login or registration attempts | Each authentication route has a per-IP limit of 10 requests per 15-minute window. Production deployments behind proxies must configure Express trusted-proxy settings carefully before relying on client IP rate limits. |
| Revoked or disabled account continuing to authenticate | Every protected request verifies the JWT, checks the persistent token-revocation collection, and reloads the account from MongoDB. Revocation records contain only a hash of the random token ID and expire with the token; revocations survive process restarts. Startup explicitly builds the unique token-ID hash and unique permission-pair indexes; index build failures abort startup. |
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
| Audit event tampering through the API | Audit history is readable only by active database-role administrators. There are no API update/delete routes, and persisted fields are immutable in the Mongoose schema. Database administrators remain able to alter records directly. |
| Revocation storage or audit failure during logout | Logout only returns success after persistent revocation and audit insertion succeed. If audit insertion fails after the revocation write, the endpoint reports a server error but the token remains revoked. If the revocation write fails, the request fails and does not claim logout. |
| Sensitive data leaking through audit logs | Audit records contain actor/action/resource identifiers, outcome, timestamp, and a strict allowlist of reason/action codes. They do not include credentials, tokens, cookies, filenames, document metadata, or document contents. |
| Failed audit persistence producing a false success response | Controllers await audit insertion and forward persistence failures to the generic `500` handler. Uploads attempt compensation by deleting the new database record and file. For metadata changes, permission changes, deletion, or initiated downloads, the underlying operation may have taken effect before audit insertion failed; the API does not claim success, but does not guarantee rollback. |
| Duplicate or inconsistent audit events | Successful events are written once in the operation controller after completion; authorization middleware writes denial events only when it rejects. Login audit events cover validly shaped credential failures only. Download records indicate authorized stream initiation, not verified full receipt. |
| Unattributable authentication failures | Invalid bearer tokens and malformed login requests are not logged; they have no safely verified actor and logging unauthenticated input risks exposing or amplifying attacker-controlled data. Valid login attempts rejected for credentials are recorded without email, password, token, or IP address. |

## Verification

The current Jest tests exercise the HTTP readiness response while MongoDB is
disconnected, reject an empty connection string, and mock startup index
creation/failure. These checks do not verify access to a live Atlas deployment.
Auth, authorization,
and document API tests use Supertest with mocked persistence; they exercise
routes/middleware, permission grant/revoke behavior, immediate authorization
rechecks, upload validation, safe storage-key handling, and file limits, but do
not prove live MongoDB behavior or deployed database indexes.

## Accepted risks and future work

This service is not ready for production use: it has no audit transaction/outbox
or cross-resource filesystem/database transaction. Revocation depends on the
availability and durability of MongoDB and its indexes. Existing permission
or revocation records that conflict with unique indexes can prevent startup
until repaired. The MongoDB Atlas network access policy, private storage
backup/cleanup, and credential rotation are deployment responsibilities.
Reassess this threat model before deployment.
