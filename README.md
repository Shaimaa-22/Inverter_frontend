# Inverter Control — Frontend

Plain HTML/CSS/JavaScript client for the [Inverter Control Backend](https://github.com/Shaimaa-22/Inverter_backend). No framework — just static files talking to the backend over `fetch` and WebSocket.

> **Note:** this README is written from the frontend's known stack and its integration contract with the backend. Adjust file/folder names below to match your actual project layout.

## Stack

- HTML5 / CSS3
- Vanilla JavaScript (no build step, no framework)
- `fetch` API for REST calls
- `WebSocket` for real-time device status and command updates

## What it does

- Login form → `POST /api/auth/login` → session cookie (HttpOnly) is set by the backend automatically
- Displays current device status (`GET /api/device/status`)
- Sends ON/OFF commands (`POST /api/device/command`) and tracks each command until it reaches a terminal state (`confirmed` / `failed` / `timeout`)
- Listens on a WebSocket connection for live updates instead of constant polling

## Talking to the backend

All protected requests must include cookies:

```js
fetch(url, { credentials: 'include' });
```

### Sending a command and tracking it

```js
const create = await fetch('/api/device/command', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ command: 'ON' })
}).then((r) => r.json());

const requestId = create.data.requestId;

const timer = setInterval(async () => {
  const result = await fetch(`/api/device/command/${requestId}`, {
    credentials: 'include'
  }).then((r) => r.json());

  const status = result.data.command.status;
  if (['confirmed', 'failed', 'timeout'].includes(status)) {
    clearInterval(timer);
    // update UI with final status
  }
}, 1000);
```

### Real-time updates via WebSocket

```js
const { token } = await fetch('/api/auth/ws-token', { credentials: 'include' })
  .then((r) => r.json());

const ws = new WebSocket(`wss://YOUR-BACKEND-HOST/ws?token=${token}`);

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  // handle device status / command state updates
};
```

The WebSocket token is short-lived (2 minutes) — request it right before opening the connection, not in advance.

## Configuration

The frontend's origin must exactly match the backend's `FRONTEND_ORIGIN` environment variable, or requests will be rejected by CORS and the backend's same-origin CSRF check. During local development this is typically:

```
http://localhost:5500
```

## Local development

Since there's no build step, any static file server works, e.g.:

```bash
npx serve .
# or
python3 -m http.server 5500
```

Make sure the backend's `FRONTEND_ORIGIN` matches the port you serve on.

## Auth notes

- The session token is stored in an HttpOnly cookie — it is **not** accessible from JavaScript, and that's intentional (XSS protection). Don't try to read or store it manually.
- Logging out (`POST /api/auth/logout`) invalidates all previously issued sessions immediately, not just the current one.
- Role-based UI: `operator` accounts can only see their own command history; `admin` accounts can see all commands, manage users, and view the full audit log.
