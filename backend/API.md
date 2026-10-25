# TrustVault API

## Health

### `GET /health`

Checks whether the application can use its MongoDB connection.

- **Authentication:** None; this is an operational readiness endpoint.
- **Input:** None.
- **Success (`200`):** `{"status":"ok","database":"connected"}`.
- **Unavailable (`503`):** `{"status":"unavailable","database":"disconnected"}`.

The response does not include connection strings or other database details.

## Authentication

Authentication endpoints require a configured `JWT_SECRET` of at least 32
bytes. Access tokens are signed with HS256 and expire after 15 minutes.
Registration and login are rate-limited to 10 requests per IP in a 15-minute
window (`429` with `{"error":"Too many authentication attempts"}` after the limit).

### `POST /api/auth/register`

Creates a regular owner account and returns an access token.

- **Authentication:** None.
- **Input JSON:** `{"name":"Taylor User","email":"taylor@example.com","password":"AtLeast12Characters"}`.
- **Authorization:** Public registration always assigns `owner`. Extra fields,
  including `role`, are rejected.
- **Success (`201`):** `{"token":"<access-token>","user":{"id":"...","name":"...","email":"...","role":"owner","status":"active","createdAt":"...","updatedAt":"..."}}`.
- **Invalid input (`400`):** `{"error":"Invalid request body"}`.
- **Duplicate email (`409`):** `{"error":"Email already registered"}`.
- **Signing key unavailable (`503`):** `{"error":"Authentication unavailable"}`.

The password must be at least 12 characters and at most 72 UTF-8 bytes to
match bcrypt's supported input length. Email is trimmed and lowercased.

### `POST /api/auth/login`

Authenticates a user and returns a short-lived access token.

- **Authentication:** None.
- **Input JSON:** `{"email":"taylor@example.com","password":"AtLeast12Characters"}`.
- **Authorization:** Credentials are checked against the stored bcrypt hash.
- **Success (`200`):** Same `token` and public `user` shape as registration.
- **Invalid input (`400`):** `{"error":"Invalid request body"}`.
- **Invalid credentials or disabled account (`401`):** `{"error":"Invalid email or password"}`.
- **Signing key unavailable (`503`):** `{"error":"Authentication unavailable"}`.

Unknown users, wrong passwords, and disabled accounts receive the same
credential error. Password hashes are never returned.

### `GET /api/auth/me`

Returns the current authenticated account.

- **Authentication:** Required; send `Authorization: Bearer <access-token>`.
- **Input:** None.
- **Authorization:** The token must have a valid signature, issuer, audience,
  and expiry. The corresponding active user is loaded from MongoDB for every
  request.
- **Success (`200`):** `{"user":{"id":"...","name":"...","email":"...","role":"...","status":"active","createdAt":"...","updatedAt":"..."}}`.
- **Missing, invalid, expired token or disabled account (`401`):** `{"error":"Authentication required"}`.
- **Signing key unavailable (`503`):** `{"error":"Authentication unavailable"}`.

### `POST /api/auth/logout`

Revokes the access token used for this request.

- **Authentication:** Required; send the access token in the `Authorization`
  header.
- **Success (`204`):** Empty response. The same token is rejected by all
  protected routes after logout succeeds.
- **Missing, invalid, expired, or previously revoked token (`401`):**
  `{"error":"Authentication required"}`.
- **Persistence failure (`500`):** The server does not claim logout succeeded.

Each issued JWT contains a random token identifier. The server persists only a
SHA-256 hash of that identifier, the user ID, and token expiry in MongoDB. The
middleware checks the revocation collection on every protected request.
Expired revocation records are eligible for MongoDB TTL cleanup; token expiry
is independently enforced by JWT verification. Revocation survives application
restarts and does not revoke other sessions for the same user. Logout is
recorded in the audit history without storing the token or identifier.

## User lookup

### `GET /api/users/lookup?email=recipient@example.com`

Finds one active account by exact email for document sharing.

- **Authentication:** Required; send the access token in the `Authorization`
  header.
- **Rate limit:** 20 lookups per IP in a 15-minute window.
- **Success (`200`):** `{"user":{"id":"...","name":"Recipient User","email":"recipient@example.com"}}`.
- **Invalid email (`400`):** `{"error":"Enter a valid email address"}`.
- **No active matching account (`404`):** `{"error":"No active account found for that email"}`.
- **Missing or invalid authentication (`401`):** `{"error":"Authentication required"}`.

Email matching is trimmed and case-insensitive. The endpoint returns only the
recipient ID, name, and email; it excludes the signed-in user's own account and
does not provide a user directory or partial-match search. Account IDs are
returned only to authenticated callers because the permission API requires the
recipient ID. Lookup is rate-limited to reduce account enumeration.

## Administrator APIs

Administrator APIs require an authenticated user whose current database role
is `admin`. Client-supplied role claims are ignored. User responses never
include passwords, hashes, tokens, or database credentials.

### `GET /api/admin/dashboard`

Returns total users, active users, total documents, and the number of audit
events in the last seven days, plus the five newest events from that period.
The event response contains the same limited fields as administrator audit
history.

### `GET /api/admin/users?page=1&limit=20`

Returns a page of users ordered newest first. `page` and `limit` must be
positive integers; the limit defaults to 20 and is capped at 100.

- **Success (`200`):** `{"users":[{"id":"...","name":"...","email":"...","role":"owner","status":"active","createdAt":"..."}],"pagination":{"page":1,"limit":20,"total":1,"pages":1}}`.
- **Invalid pagination (`400`):** `{"error":"Invalid user pagination"}`.

### `PATCH /api/admin/users/:userId/status`

Enables or disables a non-admin account.

- **Input JSON:** `{"status":"disabled"}` or `{"status":"active"}`.
- **Success (`200`):** Returns only the target account ID, name, email, role,
  and status.
- **Errors:** `400` malformed ID, invalid status, or self-change; `401`
  unauthenticated; `403` non-admin or attempt to change an administrator;
  `404` account not found.

Administrator accounts and the current administrator cannot be disabled
through this endpoint. Roles are not changed; initial administrator promotion
continues to use the existing one-time bootstrap procedure. Disabling an
account makes subsequent authentication fail because the authentication
middleware checks current database status on every request.

## Documents

All document endpoints require `Authorization: Bearer <access-token>`.
Documents are stored under the private `PRIVATE_UPLOAD_DIR` (default
`backend/private-uploads`) and are never served as static files. Only PDF, PNG,
and JPEG uploads are accepted, with a 5 MiB maximum. The server checks the
file signature as well as extension and declared MIME type; the client MIME
type is not treated as proof of content.

### `POST /api/documents`

Uploads a private document using `multipart/form-data`.

- **Role:** Active `owner` or `admin`.
- **Fields:** Required `file`; optional `name`, `category`, `description`.
- **Success (`201`):** `{"document":{"id":"...","ownerId":"...","originalFilename":"...","name":"...","category":"...","description":"...","mimeType":"application/pdf","size":123,"createdAt":"...","updatedAt":"..."}}`.
- **Invalid type/name/metadata (`400`):** `{"error":"Invalid document upload"}`.
- **Oversized file (`413`):** `{"error":"Uploaded file is too large"}`.

The owner is set from the authenticated user. Client owner IDs and storage
paths are not accepted.

### `GET /api/documents`

Lists and searches documents the current user owns or has been explicitly
granted access to. Returns at most 100 newest matches.

- **Authorization:** Ownership or an existing permission grant.
- **Optional query:** `name` (literal substring), `category`, `ownerId` (24
  hex characters), `from` and `to` (parseable date bounds).
- **Success (`200`):** `{"documents":[<document metadata>, ...]}`.
- **Invalid filters (`400`):** `{"error":"Invalid search filters"}`.

### `GET /api/documents/:documentId`

Returns document metadata.

- **Authorization:** Owner, or explicit `read`/`edit` permission.
- **Success (`200`):** `{"document":<document metadata>}`.
- **Missing/malformed ID (`404`):** `{"error":"Document not found"}`.
- **Insufficient permission (`403`):** `{"error":"Forbidden"}`.

### `GET /api/documents/:documentId/download`

Streams a private file as an attachment after checking current access on that
request. No public or permanent URL is created.

- **Authorization:** Owner, or explicit `read`/`edit` permission, checked for
  each download request.
- **Success (`200`):** File bytes with attachment disposition.
- **Caching:** `Cache-Control: private, no-store`.
- **Missing database document/file (`404`):** Safe not-found response.
- **Insufficient permission (`403`):** `{"error":"Forbidden"}`.

### `PATCH /api/documents/:documentId`

Updates document metadata only.

- **Authorization:** Owner or explicit `edit` permission.
- **Input JSON:** At least one of `name`, `category`, or `description`.
- **Success (`200`):** `{"document":<updated metadata>}`.
- **Invalid metadata (`400`):** `{"error":"Invalid document metadata"}`.
- **Insufficient permission (`403`):** `{"error":"Forbidden"}`.

Owner, storage key, file contents, MIME type, and size are immutable through
this endpoint.

### `DELETE /api/documents/:documentId`

Deletes the document and its private stored file.

- **Authorization:** Document owner only. Edit grants do not confer deletion.
- **Success (`204`):** Empty response.
- **Missing/malformed ID (`404`):** `{"error":"Document not found"}`.
- **Non-owner (`403`):** `{"error":"Forbidden"}`.

### `PUT /api/documents/:documentId/permissions/:userId`

Creates or changes a document permission for an existing active user. Repeating
the request updates the existing grant instead of creating a duplicate.

- **Input JSON:** `{"access":"read"}` or `{"access":"edit"}` only.
- **Authorization:** Document owner only; admin role and existing edit grants
  do not bypass this rule.
- **Success (`200`):** `{"permission":{"documentId":"...","userId":"...","access":"read"}}`.
- **Errors:** `400` malformed user ID, self-grant, invalid permission or extra
  fields; `401` unauthenticated; `403` non-owner; `404` document or active user
  not found.

### `DELETE /api/documents/:documentId/permissions/:userId`

Revokes the specified user's document permission.

- **Authorization:** Document owner only.
- **Success (`204`):** Empty response.
- **Errors:** `400` malformed user ID; `401` unauthenticated; `403` non-owner;
  `404` document or permission not found.

Document access middleware checks the current permission record on each
request. Therefore, after a successful revoke, the next protected read,
download, or edit request is denied. A non-owner with an edit grant was never
authorized to delete; deletion remains owner-only before and after revocation.
Admin role alone does not bypass document-level checks.

## Security audit history

### `GET /api/audit-logs`

Returns the newest persistent audit entries. The route is restricted on the
server to authenticated, active users whose database role is `admin`.

- **Optional query:** `limit` (positive integer; defaults to 50 and is capped
  at 100).
- **Success (`200`):** `{"auditLogs":[{"actorUserId":"...","action":"document.upload","documentId":"...","targetUserId":null,"permissionType":null,"timestamp":"...","outcome":"success","metadata":{}}]}`.
- **Missing/invalid authentication (`401`):** `{"error":"Authentication required"}`.
- **Non-admin (`403`):** `{"error":"Forbidden"}`.
- **Invalid limit (`400`):** `{"error":"Invalid audit history limit"}`.

Audit actions include document upload, download, metadata update, deletion,
permission grant/revoke, denied document access, denied permission changes,
login failures with validly shaped but incorrect credentials, and initial
administrator promotion through the one-time server-side bootstrap. Failed
authentication headers are not recorded because they do not provide a
reliably attributable actor. Audit metadata is restricted to safe action and
reason codes; passwords, tokens, cookies, database credentials, filenames,
document metadata, and document contents are not included. There are no API
routes to update or delete audit entries.

Sensitive endpoints await audit persistence. A persistence error returns a
server error rather than an audited-success response. Uploads attempt to remove
the created document and file if the success record cannot be written. Other
operations can already have committed before audit persistence fails, because
the service does not use a MongoDB transaction or a transactional filesystem
outbox; clients must not infer rollback from a `500`. A download is recorded
when authorized streaming is initiated, not when complete delivery is
confirmed.

## Authorization middleware

- **`authorizeRoles('admin', ...)`:** Authorizes only roles on the active
  server-loaded `request.user`. A role claim supplied by the caller is ignored.
  Missing identity returns `401`; an unlisted, invalid, or inactive role
  returns `403`.
- **`requireDocumentAccess('read')`:** Loads the document by its route
  `documentId`; owners can read their own document, and other users need an
  explicit `read` or `edit` permission.
- **`requireDocumentAccess('edit')`:** Owners can edit their own document;
  other users need an explicit `edit` permission.
- **`requireDocumentOwner`:** Loads the document and permits only its recorded
  owner. This protects document deletion and permission management.

Missing or malformed documents return `404`; missing permission or non-owner
requests return `403`. Document role `admin` does not implicitly bypass
document permissions.
