# DebugDSA Frontend

React 18 single-page application built with Vite and tested with Vitest.

## Local development

```sh
npm ci
npm start
npm test
npm run build
```

Vite serves the app at `http://localhost:5173` by default. Local API requests
default to `http://localhost:5000`. `npm run build` writes the static site to
`build/`, which is also the output directory used by the Docker image.

## Configuration

Copy `.env.example` to `.env` for local development and set `REACT_APP_API` to
the backend origin, without an `/api` suffix. Firebase browser settings use the
`REACT_APP_FIREBASE_*` values in that file and are embedded in the frontend
build. In production, the frontend always uses its own origin and expects a
reverse proxy for both `/api` and `/socket.io`; configure the Firebase build
values in the hosting platform or Docker build arguments. The included Vercel
rewrite handles `/api` only, so use a WebSocket-capable reverse proxy (such as
the included Nginx configuration) when Socket.IO battles are required.

Set the backend `ALLOWED_ORIGINS` to the exact frontend origin (scheme and host,
no path), and set `FRONTEND_URL` to that origin for OAuth and password-reset
redirects. Keep private keys and service credentials in the backend environment.

For hosted AI, `OLLAMA_URL` must be reachable from the backend service, or set
`AI_PROVIDER=groq` and `GROQ_API_KEY`. A localhost Ollama URL refers to the
backend container itself.
