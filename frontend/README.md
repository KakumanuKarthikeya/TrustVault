# TrustVault frontend

React, Vite, and JavaScript client for the TrustVault API.

## Run locally

```sh
npm install
copy .env.example .env
npm run dev
```

Set `VITE_API_BASE_URL` in `.env` if the API is not running at
`http://localhost:5000/api`. The API must also allow the frontend origin in its
`CORS_ORIGINS` configuration.

## Available scripts

- `npm run dev` — start the Vite development server
- `npm run build` — create the production bundle in `dist/`
- `npm run lint` — lint the frontend source
- `npm run preview` — preview the production bundle

The UI uses authenticated API responses for account and document information.
It does not include sample records. Audit history is only requested for
administrator accounts. Profile updates, password changes, 2FA, notification
preferences, session inventory, and user lookup are not provided by the current
backend API.
