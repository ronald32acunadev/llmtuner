# Local LLM prompt rules (pumbastudio, pumbalama)

Paste this list into the system message of every code request to a local model. When a review rejects part of an answer, add one short rule here (no history).

- Use only the injected runner, mapping, and paths: no `Path.exists()`, `os.environ`, or `Path.home()` in code that receives them.
- A parameter that defaults to `None` meaning "use the default" calls the default explicitly.
- Bind every name a `finally` block uses before the `try`.
- `subprocess.Popen`: call `wait()` before reading `returncode`.
- An `except` that maps some exception types re-raises all others.
- Timers and callbacks capture what they need in a local variable.
- Always repeat in the closing checklist: only real imports, `collections.abc` for `Mapping`/`Callable`, built-in generics, `X | None`; no `typing.Optional`, no `from __future__ import annotations`.
- No step-number comments, no comments that restate the code.
- Never assign attributes of a frozen dataclass; build it complete.
- Read files through the given root path, never a path relative to the current directory.
- Every command gets the full env the task lists; do not drop it on some commands.
- `glob()` returns a generator, always truthy: use `any(...)` or `next(..., None)`.
- Qt `Signal(...)` is declared at class level, never assigned in `__init__`; connect signals to bound methods, not lambdas that capture objects.
- Use enum members exactly as the brief spells them (case included).
- Qt `self.tr("...")` takes a string literal, never a variable; `blockSignals` is a plain call, not a context manager.
- Ask for one file per request and end the request with a 3-line checklist of the rules it most needs.
- Tests: pytest functions with `tmp_path`; never write to `/tmp`; never patch a whole module; import every name used.
- Tests: keep each requested test's name, inputs, and assertions exactly; assert exact values.
- JavaScript node:test requests override Python test conventions; use the exact target import, injected env, cleanup every scratch root, and never substitute placeholder assertions for requested behavior.
- JavaScript arrow-function mocks must name their parameters explicitly; never read `arguments` from an arrow function.
- Tests for Promise-returning APIs must await results; security tests must supply real sender identities and count every forbidden dependency call, not merely assert rejection.
- IPC authorization must compare `event.senderFrame` with `webContents.mainFrame`; comparing the destination frame with itself does not authenticate the caller.
- For ESM file fixtures, pass the exact `new URL(relativePath, import.meta.url)` to fs APIs; do not use URL.pathname or shorten the requested directory path.
- UI test doubles must use the exact production method names and result shapes; distinguish a disabled setting value from an HTML control being disabled.
- New application-owned UI error messages must use the existing i18n catalog; success flags such as `copied` must be confirmed with `=== true`, not truthiness.
- Every HTML label for a form control must include the exact matching `for` attribute; an i18n attribute is not an accessibility association.
- Stateful test selection queues must be created once outside callbacks; use real named exports and Node assertions (`doesNotMatch`, `equal`), never invented assertion methods.
