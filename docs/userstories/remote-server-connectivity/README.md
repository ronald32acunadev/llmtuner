# Feature: Remote Server Connectivity & IP Resolution

## Overview
Improve remote daemon accessibility and developer ergonomics by:
1. Dynamically resolving and displaying the machine's actual LAN IPv4 address (e.g. `http://192.168.90.10:7860`) instead of the confusing wildcard `http://0.0.0.0:7860` in startup logs and connection details.
2. Adding CORS and HTTP `OPTIONS` preflight handling to `src/web/server.js` so remote Web/Desktop clients can connect without browser `Failed to fetch` errors.

---

## User Stories

### US-01: LAN IP Discovery for Server Startup and Connection Details
- **Statement**: As a user running LLM Tuner in server mode, I want the CLI startup logs and connection details to show my actual LAN IP address instead of `0.0.0.0`, so that I can immediately connect from other PCs without manually searching for my local IP.
- **Dependencies**: None.
- **Acceptance Criteria**:
  1. A helper `resolveConnectableHost(host)` in `src/core/util.js` detects the primary non-internal IPv4 interface when `host === '0.0.0.0'`.
  2. If `host` is specific (e.g. `127.0.0.1` or a custom IP), it is preserved.
  3. `serveCommand` logs `http://<lan-ip>:<port>` and returns the connectable URL.
  4. CLI Settings (`serverConnectionDetails`) and Web/Desktop server connection info render the connectable host/URL.
  5. `serveCommand` supports `port: 0` explicitly without falling back to 7860 when port 0 is provided.
- **Verification Method**: Unit tests in `test/server-lan-ip.test.js` and `test/cli-serve.test.js`.
- **Status**: Complete
- **Observed Results**: 4/4 tests passed in `test/server-lan-ip.test.js` and 5/5 in `test/cli-serve.test.js` verifying host resolution, loopback fallback, LAN IPv4 detection, and explicit port 0 handling.

---

### US-02: CORS and Preflight (OPTIONS) Handling for Remote Server
- **Statement**: As a user connecting to a remote LLM Tuner server from Desktop or Web on another PC, I want the daemon to support CORS and `OPTIONS` preflight requests, so that authenticated API requests do not trigger browser `Failed to fetch` errors.
- **Dependencies**: US-01.
- **Acceptance Criteria**:
  1. HTTP `OPTIONS` requests receive a `204 No Content` response with `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, and `Access-Control-Allow-Headers: Authorization, Content-Type`.
  2. Preflight `OPTIONS` requests bypass Bearer token verification per the W3C CORS specification (browsers do not attach Authorization headers to preflight checks).
  3. All `/api/*` responses include `Access-Control-Allow-Origin: *` headers.
  4. Cross-origin browser fetch tests with `Authorization: Bearer <token>` succeed without preflight failure.
- **Verification Method**: Unit tests in `test/server-cors.test.js`.
- **Status**: Complete
- **Observed Results**: 3/3 tests passed in `test/server-cors.test.js` and 310/310 passed across full project test suite verifying preflight 204 handling, CORS response headers on 200 and 401, and end-to-end compatibility.
