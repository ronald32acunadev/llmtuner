# Prompting a local code model (32k context)

Project-independent guide for any agent (Claude Code, Antigravity, Codex, Cursor, OpenCode) that delegates code to a local model served by LM Studio or Ollama with a 32,768-token context. Copy this file to `.agents/` in any repository and keep that project's own rules in `.agents/local-llm-prompt-rules.md`.

## Token budget per request

Prompt and answer share the 32k window. Estimate 1 token per 4 characters of English or code (1 per 3.5 for Spanish).

| Part | Budget |
| :--- | :--- |
| System message: role + project rules | 500 |
| Library Context Brief (versions, exact API, one verbatim call site) | 3,000 |
| Existing code the change touches (verbatim, only what is needed) | 8,000 |
| Task, step by step, and the tests it must pass | 3,000 |
| Closing checklist | 100 |
| **Answer (leave at least this free)** | **16,000** |

About 16,000 tokens of answer is a file of roughly 600-800 lines; aim for half that. If the existing code alone is over 8,000 tokens, send signatures and docstrings of what the change calls, not whole files.

## Build the dictionary first

Local models are not experts and cannot browse. Their quality depends on what the agent sends, so any agent with internet access prepares the facts before asking for code.

1. Read the exact version from the lockfile and the runtime.
2. Fetch the official docs for that version (Context7, the project's docs site, then the installed type definitions).
3. Save a curated entry to `.context/<library>@<version>.md`, using `.agents/context-dictionary-template.md`. Commit it: the dictionary is shared by every agent and must survive clean checkouts.
4. Paste only the relevant sections into each request.
5. When the model gets something wrong, add the wrong form to the entry as `WRONG: ...`, and add a rule to `.agents/local-llm-prompt-rules.md` if it applies beyond one library.

## Ladder when an answer is wrong

Improve the instructions before changing implementer. Each step costs seconds; a hosted fallback costs far more and teaches the local route nothing.

1. **Behavior spec**: signatures, inputs, outputs, exact values. Enough for simple modules.
2. **Dictionary sections**: the verified API forms and wrong forms for what the task touches.
3. **Verbatim helpers**: the exact signature and return value of every helper a test or module calls. Models guess whatever you omit.
4. **Skeleton with TODOs**: the complete file, with only the missing lines marked `// TODO: ...`. This fixes almost everything else, including patterns the model misuses.
5. **Hosted fallback**: only after a focused correction also fails, as the provider order below says.

Keep these request shapes reliable:

- Ask for exactly one fenced code block. Do not nest fences inside a multi-block answer: the model may echo the request instead of answering. Send one block per request.
- Wrap each call in a timeout (`timeout 180 python3 scripts/ask_local_llm.py ...`): a looping model otherwise runs until the script's own limit. A stuck request is a reason to tighten the prompt, not to wait.
- Copy mechanical fixes yourself (a rename, a fixed import, one wrong expected value). Send logic back to the model.

## Trust nothing because it passes

A model can encode its own bug in its own test. One answer resolved a confirmation immediately, and its test awaited that result before answering, so everything passed while the guard was gone.

- Review logic against the contract, not only the test status.
- Observe RED by applying the test before the implementation.
- Read the test for what it proves: an assertion before the action, or a count checked before the call, proves nothing.
- Run the suite and read its result before committing. Never chain a commit after a test command in the same shell line.
- Run tests with a timeout: an unmocked prompt or an open server hangs the whole suite.
- Before writing a platform fact into a rule, check it in the docs. Assumptions from memory are often out of date.

## One request, one unit

- Start only after the user approves the complete backlog and chooses all stories or one at a time. Include the current story ID and acceptance criteria in each request; a story may require several bounded requests.
- One file per request, or one function or class when the file is large. Two files at once is where small models start dropping requirements.
- For implementation requests, send the existing tests and their criterion or regression-risk references first. For test-generation requests, send approved criteria, scenarios, and required observable assertions; preexisting test code is not required.
- Ask for the full file when it is under about 300 lines; above that, ask for an exact replacement block with the lines before and after it.

## Structure of every request

```text
SYSTEM
You write production <language> for <project>. <language rules: English identifiers, comment style>.
Rules:
<paste .agents/local-llm-prompt-rules.md>

USER
## Library Context Brief
- Runtime: <language + exact version>
- <library>@<exact version from the lockfile>
  - Imports: <exact import lines>
  - API: <signatures used>
  - Use <new>, not <old>; do NOT use <removed APIs>
  - Existing usage: <verbatim call site>
  - Wrong forms: <WRONG entries from the dictionary>

## Existing helpers
<exact signature and return value of each helper the code calls>

## Task
<approved story ID, acceptance criteria, dependencies, and execution mode>
<names, signatures, exact values, behavior per input, error cases>

## Verification contract
<story-scoped criterion IDs such as US-01 / AC-01>
<preconditions, inputs, action, expected outputs/errors and applicable state effects>
<change-related regression risks; verification level and existing runner>
<implementation request: existing test names and assertions, verbatim>
<test-generation request: approved scenarios and required assertions; map each test to a criterion or change-related risk>
<relevant success, negative, and boundary cases; no invented requirements or fixed scenario quotas>

## Final checklist before you answer
1. <the rule this task most needs>
2. <the second>
3. <the third>

## Output format
<full file | exact replacement block>, preceded by its path.
```

Put the three rules the task most needs at the very end: small models weigh the last lines most.

## Review and the rules file

1. Check each new or changed test against its approved criterion or change-related regression risk. Assert observable behavior, including applicable rejection and unchanged state, not merely mock calls. Run applicable checks using the existing runner with deterministic isolated state; follow the test-first policy in `AGENTS.md` when meaningful runnable tests exist. Read the diff for invented imports, real-filesystem calls where values are injected, swallowed exceptions, and dropped requirements.
2. Send one focused correction request naming the defect and the correct API. If still incorrect, report the blocker. Do not silently make the planning model the code writer; use the routing and explicit authorization rules in `AGENTS.md`.
3. Every defect that could repeat becomes one line in `.agents/local-llm-prompt-rules.md`: the rule only, no history, imperative, under 25 words. Keep the file under 300 words; merge or drop rules that never fire.
4. Record the implementer and criterion-to-check mapping in the existing story file, with actual test file/name or reproducible manual steps and observed results. Missing, failed, skipped, or blocked required proof prevents completion; document manual-only verification honestly. No separate tracker or retroactive labeling of unrelated historical tests or helpers is required. Approved scope revisions update affected checks and preserve still-valid evidence. Corrections improve future prompts; they do not retrain model weights automatically.
5. In one-at-a-time mode, show the story's changes and checks, then wait for explicit approval before starting the next story. In all-stories mode, continue within the approved backlog unless blocked.

## Choosing and calling the model

Measured on 2026-10-23 with one real request (a 180-line Python module, scored by its 12 tests), on two RTX 5070:

| Model | Time | Result |
| :--- | :--- | :--- |
| gemma-4-31b-it-qat (dense), reasoning off | 67 s | 11/11 tests |
| gemma-4-31b-it-qat, reasoning on | 128 s | 11/11 tests |
| qwen3-coder-30b-a3b (MoE, ~3B active) | fast | did not import |
| gemma-4-12b, reasoning off | 27 s | 0/12 tests |
| gemma-4-12b and gemma4:26b (MoE), reasoning on | 8-13 min | empty: reasoning filled the 32k window |

- Prefer a dense model of about 30B for code; small or MoE models are fast but their code needs rewriting.
- Send `"reasoning_effort": "none"` in the chat request (LM Studio's OpenAI API honors it); thinking models otherwise reason until the window is full.
- A 30B dense model needs 1-2 minutes per file: call the HTTP API directly with a long timeout when an MCP tool gives up first.

## Provider order

1. LM Studio (`pumbastudio`, port 1234): whatever model is loaded; check `GET /v1/models`.
2. Ollama (`pumbalama`, port 11434): the model in `GET /api/ps`.
3. An available lightweight hosted implementer when neither local provider works or the user explicitly bypasses local execution. Keep the reasoning-capable planner responsible for context and review, not default code generation.

Resolve hosted model choices through the current client's supported capabilities, without hardcoded names. If switching or delegation is unavailable, ask the user to select a lightweight model or explicitly authorize the current model. Do not claim a model switch happened without evidence. Documentation, configuration, and mechanical edits remain orchestrator-owned under `AGENTS.md`.

Unload the local model before work that needs the GPU.
