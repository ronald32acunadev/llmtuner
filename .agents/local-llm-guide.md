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

## One request, one unit

- Start only after the user approves the complete backlog and chooses all stories or one at a time. Include the current story ID and acceptance criteria in each request; a story may require several bounded requests.
- One file per request, or one function or class when the file is large. Two files at once is where small models start dropping requirements.
- Send the tests first, then ask for the implementation that passes them. Tests are the most precise spec a small model can follow.
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

## Task
<approved story ID, acceptance criteria, dependencies, and execution mode>
<names, signatures, exact values, behavior per input, error cases>

## Tests it must pass
<test names and assertions, verbatim>

## Final checklist before you answer
1. <the rule this task most needs>
2. <the second>
3. <the third>

## Output format
<full file | exact replacement block>, preceded by its path.
```

Put the three rules the task most needs at the very end: small models weigh the last lines most.

## Review and the rules file

1. Run the tests. Read the diff for invented imports, real-filesystem calls where values are injected, swallowed exceptions, and dropped requirements.
2. Send one focused correction request naming the defect and the correct API. If still incorrect, report the blocker. Do not silently make the planning model the code writer; use the routing and explicit authorization rules in `AGENTS.md`.
3. Every defect that could repeat becomes one line in `.agents/local-llm-prompt-rules.md`: the rule only, no history, imperative, under 25 words. Keep the file under 300 words; merge or drop rules that never fire.
4. Record the implementer and verification outcome in the story report or existing task log. Corrections improve future prompts; they do not retrain model weights automatically.
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
