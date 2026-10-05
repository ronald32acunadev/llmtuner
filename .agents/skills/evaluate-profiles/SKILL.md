---
name: evaluate-profiles
description: >-
  Use this skill when evaluating, benchmarking, or verifying the accuracy, throughput,
  and VRAM behavior of LLM Tuner load profiles (speed, balanced, quality) across models
  installed in LM Studio or Ollama.
---

# Evaluate Profiles Skill

A repeatable, automated benchmark harness to empirically verify that LLM Tuner's load profiles (`speed`, `balanced`, `quality`) optimize execution while preserving factual accuracy and reasoning quality under long context.

## Overview

The evaluation harness feeds a deep technical context document (~11,500 tokens from [`docs/PROYECTO.md`](../../../docs/PROYECTO.md)) into the model at `temperature: 0.0`, asking 3 factual questions with verifiable ground truth.

For each model, it evaluates:
1. **Speed Profile**: Maximizes generation tokens/second, accepting lossy KV compression (`q4_0`).
2. **Balanced Profile**: Compromise rule (`tps * kvQuality`), balancing throughput and KV precision.
3. **Quality Profile**: Enforces 100% GPU offload and lossless/near-lossless KV cache (`f16` or `q8_0`).

Between each run, VRAM is freed completely to guarantee clean hardware isolation.

## Usage

### Run on All Installed Models across All Engines (Default)

By default, the skill dynamically detects all installed engines (LM Studio and Ollama) and iterates over **every installed model** sorted from smallest to largest:

```bash
node .agents/skills/evaluate-profiles/scripts/evaluate-profiles.js
```

### Run on a Specific Engine

```bash
# Run on all LM Studio models
node .agents/skills/evaluate-profiles/scripts/evaluate-profiles.js --engine lmstudio

# Run on all Ollama models
node .agents/skills/evaluate-profiles/scripts/evaluate-profiles.js --engine ollama
```

### Run on a Single Specific Model

```bash
# Evaluate a specific model in LM Studio
node .agents/skills/evaluate-profiles/scripts/evaluate-profiles.js --engine lmstudio --model qwen/qwen2.5-coder-14b

# Evaluate a specific model in Ollama
node .agents/skills/evaluate-profiles/scripts/evaluate-profiles.js --engine ollama --model qwen2.5-coder:14b
```

### CLI Options

Flag | Default | Description
:--- | :--- | :---
`--engine` | `all` | Engine to target: `all` (discovers and runs all installed engines), `lmstudio`, or `ollama`.
`--model` | *(all)* | Specific model key. If omitted, iterates through all installed models sorted from smallest to largest.
`--ctx` | `16384` | Context window size in tokens.
`--out` | `docs/EVAL_REPORT_<ENGINE>_MODELS.json` | Path to save incremental JSON results.

## Output & Reports

The runner records:
* **Candidate Configuration**: Layer placement, GPU splits, and KV cache quantization (`f16`, `q8_0`, `q4_0`).
* **Hardware Timings**: Prompt prefill tokens/s, generation tokens/s, and total elapsed seconds.
* **Accuracy Score**: Factual accuracy (0 to 3) against the [Gold Standard Reference](./references/gold-standard.md).
* **Verbatim Response**: Stored in the JSON report file for auditability.

Reports are saved in `docs/`:
* LM Studio: [`docs/EVAL_REPORT_LMSTUDIO_MODELS.json`](../../../docs/EVAL_REPORT_LMSTUDIO_MODELS.json)
* Ollama: [`docs/EVAL_REPORT_OLLAMA_MODELS.json`](../../../docs/EVAL_REPORT_OLLAMA_MODELS.json)
