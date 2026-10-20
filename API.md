# TrustVault API

Backend base URL: `http://localhost:<PORT>` (default port `3000`). JSON
endpoints use `Content-Type: application/json`; protected routes use
`Authorization: Bearer <access-token>`.

For documented safe error shapes and middleware behavior, see
[`backend/API.md`](./backend/API.md).

## Health

### `GET /health`

- **Authentication:** None.
- **Success (`200`):** `{"status":"ok","database":"connected"}`.
- **Unavailable (`503`):** `{"status":"unavailable","database":"disconnected"}`.

## Authentication

Access tokens use HS256, require a configured `JWT_SECRET` (at least 32 bytes),
and expire after 15 minutes. Registration and login are rate-limited.

### `POST /api/auth/register`

- **Input:** `{"name":"Taylor User","email":"taylor@example.com","password":"AtLeast12Characters"}`
- **Authorization:** Public; registration always sets `owner`. Extra fields,
  including `role`, are rejected.
- **Success (`201`):** `{"token":"<access-token>","user":{"id":"...","name":"...","email":"...","role":"owner","status":"active","createdAt":"...","updatedAt":"..."}}`
- **Errors:** `400` invalid body, `409` duplicate email, `503` unavailable JWT
  configuration.

### `POST /api/auth/login`

- **Input:** `{"email":"taylor@example.com","password":"AtLeast12Characters"}`
- **Authorization:** Public.
- **Success (`200`):** Same token and public-user shape as registration.
- **Errors:** `400` invalid body, `401` generic invalid credentials, `503`
  unavailable JWT configuration.

### `GET /api/auth/me`

- **Authorization:** Valid bearer token; active account is checked in MongoDB.
- **Success (`200`):** `{"user":{"id":"...","name":"...","email":"...","role":"...","status":"active","createdAt":"...","updatedAt":"..."}}`
- **Errors:** `401` missing, invalid, expired token or disabled account; `503`
  unavailable JWT configuration.

## Documents

All document routes require an active bearer-token identity. Uploads accept
PDF, PNG, and JPEG only, up to 5 MiB. Files use generated storage keys in a
private directory and are not published as static content.

### `POST /api/documents`

- **Input:** `multipart/form-data` with required `file`; optional `name`,
  `category`, and `description`.
- **Authorization:** Active `owner` or `admin`; the owner ID comes from the
  authenticated identity.
- **Success (`201`):** `{"document":{"id":"...","ownerId":"...","originalFilename":"...","name":"...","category":"...","description":"...","mimeType":"application/pdf","size":123,"createdAt":"...","updatedAt":"..."}}`
- **Errors:** `400` invalid upload, `401` unauthenticated, `403` disallowed role,
  `413` file too large.

### `GET /api/documents`

- **Input:** Optional query parameters `name`, `category`, `ownerId`, `from`,
  and `to`. Returns up to 100 newest matching documents.
- **Authorization:** Only documents owned by the current user or associated
  with an explicit permission grant are included.
- **Success (`200`):** `{"documents":[<document metadata>, ...]}`
- **Errors:** `400` invalid filters, `401` unauthenticated.

### `GET /api/documents/:documentId`

- **Authorization:** Owner or explicit `read`/`edit` permission.
- **Success (`200`):** `{"document":<document metadata>}`
- **Errors:** `401` unauthenticated, `403` forbidden, `404` missing document.

### `GET /api/documents/:documentId/download`

- **Authorization:** Owner or current explicit `read`/`edit` permission,
  checked on each request.
- **Success (`200`):** File attachment with `Cache-Control: private, no-store`.
- **Errors:** `401` unauthenticated, `403` forbidden, `404` missing metadata
  or file.

### `PATCH /api/documents/:documentId`

- **Input:** At least one of `name`, `category`, `description`; unknown fields
  are rejected.
- **Authorization:** Owner or explicit `edit` permission.
- **Success (`200`):** `{"document":<updated metadata>}`
- **Errors:** `400` invalid metadata, `401` unauthenticated, `403` forbidden,
  `404` missing document.

### `DELETE /api/documents/:documentId`

- **Authorization:** Owner only; edit permission does not permit deletion.
- **Success (`204`):** Empty response.
- **Errors:** `401` unauthenticated, `403` forbidden, `404` missing document.

## Not implemented

Permission grant/revoke APIs and audit-history/activity APIs are not currently
available. The frontend pages for these capabilities are placeholders. No
public or permanent document URLs are provided.
