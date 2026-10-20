# TrustVault

TrustVault is an individual hackathon project for secure document management.
The repository keeps the Node.js backend and React frontend together:

- `backend/` — Express, MongoDB/Mongoose, JWT authentication, role checks,
  private document storage, and Jest/Supertest tests.
- `frontend/` — React/Vite interface using React Router and Axios.

## Requirements

- Node.js 20 or newer
- npm
- MongoDB reachable by the backend (Atlas or a local development database)

## Backend setup

In PowerShell:

```powershell
Set-Location .\backend
npm install
Copy-Item .env.example .env
```

Set `MONGODB_URI` and a private `JWT_SECRET` of at least 32 bytes in
`backend/.env`. Do not paste or commit secret values.

```powershell
npm run dev
```

The API listens on `PORT` (default `3000`). Run the current backend tests:

```powershell
npm test
```

## Frontend setup

In a separate PowerShell window:

```powershell
Set-Location .\frontend
npm install
Copy-Item .env.example .env
npm run dev
```

By default, Vite proxies `/api` requests to `http://localhost:3000`. To use a
different backend port, set `VITE_PROXY_TARGET` in `frontend/.env`. To connect
directly instead of through the development proxy, set `VITE_API_URL` to the
backend API base URL, for example `http://localhost:3000/api`, and configure
the backend's `CORS_ORIGINS` to allow the frontend's origin.

The Vite server prints its local URL (typically `http://localhost:5173`).

## Current frontend pages

- Login and registration
- Dashboard and document search/list
- Document upload, metadata details, download, update, and deletion
- Permission management and audit activity placeholders

The permission-management and audit pages intentionally report that their
backend APIs are not implemented. This frontend does not pretend those actions
are available.

## Security notes and limitations

- The backend is the authority for authentication and document authorization;
  frontend route guards are only a navigation convenience.
- The frontend stores the short-lived bearer token in `sessionStorage` so it
  does not persist across browser sessions. JavaScript-accessible storage can
  still be exposed by an XSS flaw; a production design should prefer secure,
  HttpOnly, SameSite cookies with CSRF protections.
- Logout removes the browser's token; there is no server-side token revocation.
- Permission grant/revoke routes and persistent audit logging remain
  unimplemented.
- Private filesystem storage and MongoDB metadata are not an atomic transaction.
- Live MongoDB connectivity and production deployment have not been verified
  by this repository setup.

See [API.md](./API.md) for the current HTTP contract and [THREATS.md](./THREATS.md)
for security assumptions and known gaps. Actual AI interactions and test
results are recorded in [PROMPTS.md](./PROMPTS.md).
