# Node 24.22.2 dictionary

Sources: nodejs.org/docs/v24.22.2/api/ test.html and http.html (fetched 2026-10-31), plus assert.html for v26.13.0, whose documented behavior was not re-read for 24. The manifest requires Node >=24, so do not use APIs added after 24.0 (for example `req.signal`, added in 24.16.0).

## node:test
- `import { test, before, after } from 'node:test';` `test(name, async (t) => {})`.
- `t.mock.method(object, 'name', implementation)` replaces the method and restores it when the test ends.
- The call data lives on the replaced method under `.mock`, or on the returned mock under `.mock`:
```js
const create = t.mock.method(Tuner, 'create', async () => fake);
create.mock.callCount();            // number of calls
Tuner.create.mock.callCount();      // same
create.mock.calls[0].arguments;     // arguments array of the first call
```
- WRONG: `Tuner.create.callCount()`, `create.callCount()`. There is no callCount directly on the function.
- The implementation replaces the mocked function itself. To mock `Tuner.create`, the implementation must RETURN a tuner object. It does not receive `load` arguments.

## node:assert/strict
- `import assert from 'node:assert/strict';` makes `equal` and `deepEqual` aliases of the strict versions. There is no `assert.strict.equal` to use here.
- `assert.throws(fn, { code: 'x' })` tests only the listed properties. A validation function must `return true`, otherwise the assertion fails.
- `await assert.rejects(promiseOrAsyncFn, { code: 'x' })`. A string second argument is treated as the message, not as a matcher.

## node:http
- `req.on('close')` means the REQUEST completed (changed in v16). It is NOT a client disconnect signal. For a GET it can fire long before the client leaves.
- Detect a disconnect with the response:
```js
res.on('close', () => { if (!res.writableFinished) onClientGone(); });
```
- `res.writeHead(status, headers)` once, before `res.end()`. `res.write(chunk)`. `res.end()` must be called on each response.
- `server.close()` then `server.closeAllConnections()` to avoid racing new connections.

## fetch and SSE, as used in src/core/client.js
```js
const response = await fetch(url, { headers, signal });
const reader = response.body.getReader();
const decoder = new TextDecoder();
const { done, value } = await reader.read();
const text = decoder.decode(value, { stream: true });
```
Aborting through `signal` rejects the pending `read()`.

## Timers and promises
- `const timer = setTimeout(fn, ms); timer.unref?.(); clearTimeout(timer);`
- Deferred promise: store the executor's resolve function and call it later. The promise stays pending until then. Never `await` it before something can answer it.
