import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Tuner } from '../../../../src/core/tuner.js';
import { llamaServerArgs, llamaServerEnv } from '../../../../src/core/llama-server.js';
import { spawnLogged, killProcess, freePort, fetchJson, sleep } from '../../../../src/core/util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../../');

const STOP_TOKENS = ['<|im_end|>', '<end_of_turn>', '</s>', '<|eot_id|>', '<|endoftext|>'];

const goldStandard = {
  q1: {
    expected: 'DECODE_EFFICIENCY = 0.7 and readCost for q4_0 = x12',
    keywords: ['0.7', '12', 'readcost', 'q4_0']
  },
  q2: {
    expected: 'lms load rejects per-variant identifiers; project adopted variantSelect: false in LM Studio and recommends switching without writing internal files',
    keywords: ['model not found', 'variantselect', 'false', 'recommends', 'recommend']
  },
  q3: {
    expected: 'PER_GPU_OVERHEAD = 350 MiB and PER_GPU_RESERVE = 64 MiB',
    keywords: ['350', '64']
  }
};

function parseArgs() {
  const raw = process.argv.slice(2);
  const args = { engine: 'all', ctx: 16384, model: null, out: null };
  for (let i = 0; i < raw.length; i++) {
    const k = raw[i];
    if (k === '--engine' && raw[i + 1]) args.engine = raw[++i];
    else if (k === '--model' && raw[i + 1]) args.model = raw[++i];
    else if (k === '--ctx' && raw[i + 1]) args.ctx = Number(raw[++i]) || 16384;
    else if (k === '--out' && raw[i + 1]) args.out = raw[++i];
  }
  return args;
}

function makePrompt(docText) {
  return `<|im_start|>system
You are a precise technical assistant. Answer the questions strictly based on the following document.<|im_end|>
<|im_start|>user
Context Document:
---
${docText}
---

Answer each question concisely and factually:
1. What is the value of DECODE_EFFICIENCY and the readCost for q4_0 in the calibrated constants?
2. Why does lms load in LM Studio reject per-variant identifiers (such as model@variant), and what architectural solution did the project adopt?
3. What are the exact values of PER_GPU_OVERHEAD and PER_GPU_RESERVE defined in the estimator?
<|im_end|>
<|im_start|>assistant
`;
}

function scoreResponse(text) {
  const lower = text.toLowerCase();
  const q1Pass = goldStandard.q1.keywords.some((k) => lower.includes(k));
  const q2Pass = goldStandard.q2.keywords.some((k) => lower.includes(k));
  const q3Pass = goldStandard.q3.keywords.some((k) => lower.includes(k));
  const score = [q1Pass, q2Pass, q3Pass].filter(Boolean).length;
  return { q1Pass, q2Pass, q3Pass, score: `${score}/3` };
}

async function evaluateLMStudio(tuner, modelInfo, backend, ctx, profile, prompt) {
  const modelFile = modelInfo.meta.file;
  const report = await tuner.run(modelInfo.key, ctx, { profile, maxCandidates: 2, depthFraction: 0.25, genTokens: 50 });
  const best = report.best?.candidate;
  if (!best) return null;

  const port = await freePort();
  const args = llamaServerArgs(modelFile, best, port);
  const env = llamaServerEnv(backend.libDirs, best);
  const proc = spawnLogged(backend.server, args, { cwd: backend.dir, env });

  let ready = false;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const h = await fetchJson(`http://127.0.0.1:${port}/health`, { timeout: 1000 }).catch(() => null);
    if (h?.ok) { ready = true; break; }
    if (proc.child.exitCode != null) break;
  }

  if (!ready) {
    await killProcess(proc.child);
    await sleep(1000);
    await tuner.freeVram();
    return null;
  }

  const t0 = Date.now();
  const res = await fetchJson(`http://127.0.0.1:${port}/completion`, {
    method: 'POST',
    timeout: 300_000,
    body: { prompt, n_predict: 300, temperature: 0.0, stop: STOP_TOKENS },
  }).catch((err) => ({ error: err.message }));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  const timings = res?.json?.timings;
  const text = (res?.json?.content || '').trim();

  await killProcess(proc.child);
  await sleep(1500);
  await tuner.freeVram();

  return {
    candidate: { id: best.id, kvType: best.kvType, fullOffload: best.fullOffload },
    timings: {
      promptTokens: timings?.prompt_n || 0,
      promptTps: timings?.prompt_per_second || 0,
      genTokens: timings?.predicted_n || 0,
      genTps: timings?.predicted_per_second || 0,
      totalSeconds: elapsed,
    },
    evaluation: scoreResponse(text),
    text,
  };
}

async function evaluateOllama(tuner, modelKey, ctx, profile, prompt) {
  const plan = await tuner.plan(modelKey, ctx, { profile });
  const candidate = plan.candidates?.[0];
  if (!candidate) return null;

  const options = {
    num_ctx: candidate.ctx,
    num_gpu: candidate.fullOffload ? 999 : candidate.gpuLayers,
    num_thread: candidate.threads,
    num_batch: candidate.ubatch,
    temperature: 0.0,
  };

  const t0 = Date.now();
  const res = await fetchJson('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    timeout: 600_000,
    body: { model: modelKey, prompt, stream: false, options, keep_alive: '2m' },
  }).catch((err) => ({ error: err.message }));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  const json = res?.json;
  const text = (json?.response || '').trim();

  const promptTokens = json?.prompt_eval_count || 0;
  const promptSecs = (json?.prompt_eval_duration || 0) / 1e9;
  const promptTps = promptSecs > 0 ? +(promptTokens / promptSecs).toFixed(1) : 0;

  const genTokens = json?.eval_count || 0;
  const genSecs = (json?.eval_duration || 0) / 1e9;
  const genTps = genSecs > 0 ? +(genTokens / genSecs).toFixed(1) : 0;

  // Unload model
  await fetchJson('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    body: { model: modelKey, keep_alive: 0 },
  }).catch(() => null);
  await sleep(1500);

  return {
    candidate: { id: candidate.id, kvType: candidate.kvType, fullOffload: candidate.fullOffload },
    timings: {
      promptTokens,
      promptTps,
      genTokens,
      genTps,
      totalSeconds: elapsed,
    },
    evaluation: scoreResponse(text),
    text,
  };
}

async function main() {
  const args = parseArgs();
  console.log(`=== RUNNING PROFILE EVALUATOR (ENGINE: ${args.engine.toUpperCase()}) ===`);

  const docPath = path.join(REPO_ROOT, 'docs/PROYECTO.md');
  const docText = await fs.readFile(docPath, 'utf8');
  const prompt = makePrompt(docText);

  const enginesToRun = args.engine === 'all' ? ['lmstudio', 'ollama'] : [args.engine];

  for (const engineId of enginesToRun) {
    console.log(`\n======================================================`);
    console.log(`>>> ENGINE: ${engineId.toUpperCase()}`);
    console.log(`======================================================`);

    let tuner;
    try {
      tuner = await Tuner.create(engineId);
    } catch (err) {
      console.warn(`[SKIP] Engine ${engineId} is not available: ${err.message}`);
      continue;
    }

    const backend = engineId === 'lmstudio' ? await tuner.engine.backend(tuner.ctx) : null;
    const allModels = await tuner.listModels();
    allModels.sort((a, b) => a.sizeBytes - b.sizeBytes);

    const models = args.model ? allModels.filter((m) => m.key === args.model) : allModels;
    if (!models.length) {
      console.log(`  No models found for engine ${engineId} (filter: ${args.model || 'none'})`);
      continue;
    }

    const reportPath = args.out || path.join(REPO_ROOT, 'docs', `EVAL_REPORT_${engineId.toUpperCase()}_MODELS.json`);
    let existing = {};
    try {
      existing = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    } catch {}
    const results = existing.models || {};

    console.log(`Discovered ${models.length} models in ${engineId}:`);
    models.forEach((m, idx) => console.log(`  ${idx + 1}. ${m.displayName || m.key} (${(m.sizeBytes / 1024**3).toFixed(2)} GB)`));

    for (let i = 0; i < models.length; i++) {
      const m = models[i];
      console.log(`\n[${i + 1}/${models.length}] [${engineId}] Model: ${m.key} (${(m.sizeBytes / 1024**3).toFixed(2)} GB)`);

      const modelReport = {
        displayName: m.displayName || m.key,
        sizeBytes: m.sizeBytes,
        profiles: {},
        completed: false,
      };

      let modelInfo = null;
      if (engineId === 'lmstudio') {
        modelInfo = await tuner.modelInfo(m.key).catch(() => null);
        if (!modelInfo) {
          console.error(`  Could not resolve modelInfo for ${m.key}`);
          continue;
        }
      }

      for (const profile of ['speed', 'balanced', 'quality']) {
        process.stdout.write(`  Evaluating profile ${profile.toUpperCase()}... `);
        let res = null;
        try {
          if (engineId === 'lmstudio') {
            res = await evaluateLMStudio(tuner, modelInfo, backend, args.ctx, profile, prompt);
          } else {
            res = await evaluateOllama(tuner, m.key, args.ctx, profile, prompt);
          }
        } catch (err) {
          console.log(`FAILED: ${err.message}`);
          continue;
        }

        if (!res) {
          console.log(`NO CANDIDATE / LOAD ERROR`);
          continue;
        }

        console.log(`OK (Score: ${res.evaluation.score}, Prefill: ${res.timings.promptTps} t/s, Gen: ${res.timings.genTps} t/s)`);
        modelReport.profiles[profile] = res;
      }

      modelReport.completed = Object.keys(modelReport.profiles).length > 0;
      results[m.key] = modelReport;

      await fs.writeFile(reportPath, JSON.stringify({
        engine: engineId,
        contextTokens: args.ctx,
        updatedAt: new Date().toISOString(),
        goldStandard,
        models: results,
      }, null, 2));
    }

    console.log(`\nEngine ${engineId} complete. Report written to ${reportPath}`);
  }

  console.log(`\n=== ALL ENGINES EVALUATION COMPLETE ===`);
}

main().catch(console.error);
