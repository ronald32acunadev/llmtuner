# Gold Standard Evaluation Reference

This document defines the evaluation criteria, context prompt, and ground-truth answers for validating LLM Tuner load profiles (`speed`, `balanced`, `quality`).

## Evaluation Methodology

1. **Context Document**: `docs/PROYECTO.md` (~11,500 tokens). Satures the context window to test real KV cache attention mechanics.
2. **Temperature**: `0.0`. Ensures 100% deterministic outputs, eliminating sampling randomness.
3. **Hardware Isolation**: VRAM is completely freed between executions (`tuner.freeVram()` or `/api/generate keep_alive: 0`).

## The 3 Benchmark Questions & Expected Ground Truth

### Question 1: Estimator Constants
* **Prompt**: "What is the value of DECODE_EFFICIENCY and the readCost for q4_0 in the calibrated constants?"
* **Expected (Gold Standard)**: `DECODE_EFFICIENCY = 0.7` (70% of theoretical memory bandwidth) and `readCost` for `q4_0` = `x12` (12 times slower to read with Flash Attention in deep context).
* **Keywords**: `0.7`, `12`, `readcost`, `q4_0`.

### Question 2: LM Studio Variant Architecture
* **Prompt**: "Why does lms load in LM Studio reject per-variant identifiers (such as model@variant), and what architectural solution did the project adopt?"
* **Expected (Gold Standard)**: LM Studio rejects variant keys (`model@q4_k_m`) returning "Model not found". The project adopted `variantSelect: false` for LM Studio, where the tuner measures and loads the selected variant and only recommends switching without modifying LM Studio's internal config files.
* **Keywords**: `model not found`, `variantselect`, `false`, `recommends` / `recommend`.

### Question 3: VRAM Overheads
* **Prompt**: "What are the exact values of PER_GPU_OVERHEAD and PER_GPU_RESERVE defined in the estimator?"
* **Expected (Gold Standard)**: `PER_GPU_OVERHEAD = 350 MiB` and `PER_GPU_RESERVE = 64 MiB`.
* **Keywords**: `350`, `64`.

## Interpreting Results

* **Score 3/3**: Factual retrieval is flawless; attention cache is mathematically intact.
* **Score < 3/3**: Model hallucinated or lost attention due to KV degradation or context window truncation.
* **OOM (Out Of Memory)**: The model's weights + precise KV cache exceeded physical VRAM. This proves that `Quality` correctly flagged the physical limit, and `Speed` / `Balanced` with compressed KV (`q4_0`) or CPU offload is required.
