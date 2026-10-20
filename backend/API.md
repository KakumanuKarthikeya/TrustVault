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

Admin role alone does not bypass document-level checks. This stage does not
include permission-grant/revoke APIs or persistent audit logging.

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
  owner. Use this for owner-only actions such as future permission management.

Missing or malformed documents return `404`; missing permission or non-owner
requests return `403`. Document role `admin` does not implicitly bypass
document permissions.
