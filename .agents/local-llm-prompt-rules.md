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
