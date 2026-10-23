# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this repository is

This repository is a reusable project setup template containing AI coding agent rules, workflow standards, and subagent configurations. It does not define an application runtime or application-specific build and test commands. Add those in each project that reuses the template.

## Rule files and the sync invariant

- `AGENTS.md` is canonical and agent-neutral (Antigravity, Claude Code, Codex, Cursor, OpenCode). Claude-specific guidance belongs here.
- `.agents/rules/AGENTS.md` is a byte-identical copy, and `README.md` summarizes the rules. Any rule change touches all three in the same commit. Verify with:

```bash
git diff --no-index AGENTS.md .agents/rules/AGENTS.md
```

No output means they are in sync.

- Do not hardcode model names in the rules: the dynamic model policy is deliberate (commit `efabf70`).
- `Agents/readme-generator.md` is a template subagent. It lives outside `.claude/agents/`, so Claude Code does not load it from here.

## Code delegation in Claude Code

The delegation rule in `AGENTS.md` covers source code, tests, and scripts; docs, config, and commit messages are written by the agent. In Claude Code the tools are `mcp__pumbastudio__openai_chat` (primary) and `mcp__pumbalama__chat_completion` (secondary).
