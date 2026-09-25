#!/usr/bin/env node
import { select, input, confirm, search } from '@inquirer/prompts';
import { detectHardware, detectEngines, Tuner, installPlans, runInstall, listPresets, presetsDir, fmtBytes } from '../core/index.js';

const args = parseArgs(process.argv.slice(2));
const c = {
  b: (s) => `\x1b[1m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`,
};

if (args.help) {
  console.log(`llm-tuner — carga tu LLM local con la configuración más rápida para el contexto que necesitas

Uso: llm-tuner [opciones]
  --engine <lmstudio|ollama>   Motor
  --model <clave>              Modelo (clave de LM Studio o nombre de Ollama)
  --ctx <tokens>               Contexto (p. ej. 16384)
  --force                      Volver a medir aunque exista un preset
  --candidates <n>             Configuraciones a probar al medir (3)
  --yes                        No pedir confirmación
  --dry-run                    Medir y mostrar cambios sin aplicar nada ni guardar preset
  --presets                    Listar presets guardados
  --json                       Salida final en JSON
  --web                        Abrir la interfaz web

Los presets se guardan en ${presetsDir()}`);
  process.exit(0);
}

if (args.web) {
  await import('../web/server.js').then((m) => m.startServer({ open: true }));
} else if (args.presets) {
  const list = await listPresets({ engine: args.engine, modelKey: args.model });
  if (!list.length) console.log('No hay presets guardados.');
  for (const p of list) console.log(`${p.engine.padEnd(9)} ${p.model}  ${p.ctx / 1024}K  KV ${p.kvType}  ${p.fullOffload ? 'todo en GPU' : 'parcial'}  ${p.shortTps} t/s  ${c.dim(p.createdAt.slice(0, 16).replace('T', ' '))}`);
} else {
  main().catch((e) => {
    if (e?.name === 'ExitPromptError') process.exit(130);
    console.error(c.r(`\nError: ${e?.message || e}`));
    process.exit(1);
  });
}

async function main() {
  const out = (...a) => { if (!args.json) console.log(...a); };
  out(c.b('\n⚙  LLM Tuner'));

  const hw = await detectHardware();
  out(c.dim(`  ${hw.cpu.brand} · ${fmtBytes(hw.ram.totalBytes)} RAM`));
  for (const g of hw.gpus) out(c.dim(`  GPU${g.index} ${g.name} · ${fmtBytes(g.totalBytes)}${g.pcieGen ? ` · PCIe ${g.pcieGen}.0 x${g.pcieWidth}` : ''}${g.displayAttached ? ' · pantalla' : ''}`));
  if (!hw.gpus.length) out(c.y('  Sin GPU compatible: se usará solo CPU.'));

  // 1. Engine
  let det = await detectEngines(hw);
  let engineId = args.engine;
  if (!engineId) {
    engineId = await select({
      message: '¿Qué motor quieres usar?',
      default: det.recommended,
      choices: det.engines.map((e) => ({
        name: `${e.name}  ${e.detection.installed ? c.g('instalado') + (e.detection.version ? c.dim(' v' + e.detection.version) : '') : c.dim('no instalado · se instalará')}${e.id === det.recommended ? c.y('  recomendado') : ''}`,
        value: e.id,
      })),
    });
  }
  if (!det.engines.find((e) => e.id === engineId)?.detection.installed) {
    await installFlow(engineId);
    det = await detectEngines(hw);
    if (!det.engines.find((e) => e.id === engineId).detection.installed) throw new Error('La instalación no terminó. Vuelve a ejecutar llm-tuner cuando acabe.');
  }
  const tuner = await Tuner.create(engineId);

  // 2. Model
  let models = await tuner.listModels();
  if (!models.length) {
    out(c.y(`\n${tuner.engine.name} no tiene modelos descargados.`));
    const name = await input({ message: engineId === 'ollama' ? 'Modelo a descargar (p. ej. qwen2.5-coder:14b):' : 'Modelo a descargar (p. ej. qwen/qwen2.5-coder-14b):' });
    const bin = tuner.ctx.detection.bin;
    const r = await runInstall(engineId === 'ollama' ? { cmd: bin, args: ['pull', name] } : { cmd: bin, args: ['get', name, '-y'] }, (l) => out(c.dim('  ' + l)));
    if (r.code !== 0) throw new Error('No se pudo descargar el modelo');
    models = await tuner.listModels();
  }
  const modelKey = args.model || await search({
    message: 'Modelo:',
    source: (term) => models
      .filter((m) => !term || `${m.key} ${m.name}`.toLowerCase().includes(term.toLowerCase()))
      .map((m) => ({ name: `${m.name}  ${c.dim(`${fmtBytes(m.sizeBytes)}${m.quant ? ' · ' + m.quant : ''}`)}`, value: m.key })),
  });

  // 3. Context
  let ctx = Number(args.ctx) || null;
  if (!ctx) {
    const presets = await listPresets({ engine: engineId, modelKey });
    const preview = await tuner.plan(modelKey, 8192);
    const limit = preview.model.meta.trainContext || 131072;
    out(c.dim(`  Máximo con todo en GPU (estimado): ${Object.entries(preview.maxContext).map(([k, v]) => `KV ${k} ${v ? Math.floor(v / 1024) + 'K' : '—'}`).join(' · ')} · entrenado hasta ${Math.floor(limit / 1024)}K`));
    if (presets.length) out(c.dim(`  Contextos ya ajustados: ${presets.map((p) => `${p.ctx / 1024}K (${p.shortTps} t/s)`).join(', ')}`));
    ctx = Number(await input({
      message: 'Contexto (tokens):',
      default: String(presets.at(-1)?.ctx || Math.min(16384, limit)),
      validate: (v) => (Number(v) >= 512 && Number(v) <= limit) || `Entre 512 y ${limit}`,
    }));
  }

  // 4. Load (preset or benchmark)
  tuner.on('progress', (e) => {
    if (args.json) return;
    if (e.type === 'status') out(c.dim(`\n${e.message}`));
    if (e.type === 'preset-hit') out(c.g(`\n✓ Preset encontrado (${e.preset.createdAt.slice(0, 10)}): ${describe(e.preset.candidate)} · ${e.preset.bench.short.genTps} t/s medidos. No hace falta volver a medir.`));
    if (e.type === 'candidate-start') out(`  [${e.index + 1}/${e.total}] ${describe(e.candidate)}`);
    if (e.type === 'bench-progress' && e.phase === 'deep') out(c.dim(`      prompt largo (~${e.promptTokens} tokens)…`));
    if (e.type === 'candidate-done') {
      const b = e.bench;
      out(b.ok ? `      ${c.g('✓')} ${c.b(b.short.genTps + ' t/s')} corto${b.deep ? ` · ${c.b(b.deep.genTps + ' t/s')} con ${b.deep.promptTokens} tokens` : ''} · CPU ${b.cpu.avg}% · VRAM ${vramStr(b.vramPeakBytes)}` : c.r(`      ✗ ${b.error}`));
    }
    if (e.type === 'preset-saved') out(c.g(`\n✓ Preset guardado: ${e.file}`));
  });

  const result = await tuner.load(modelKey, ctx, {
    force: !!args.force,
    dryRun: !!args['dry-run'],
    maxCandidates: Number(args.candidates) || 3,
    confirmApply: async (preview) => {
      out(c.b('\nCambios:'));
      if (engineId === 'lmstudio') {
        preview.files.forEach((f) => out(`  ${f}`));
        if (preview.restartsApp) out(c.y('  LM Studio se cerrará y se volverá a abrir para guardar la config de hardware.'));
      } else {
        out(`  Nuevo modelo ${c.b(preview.tunedModel)} con num_ctx/num_gpu/num_thread fijados`);
        out(`  Servidor Ollama: ${Object.entries(preview.env).map(([k, v]) => `${k}=${v}`).join(' ')}`);
      }
      return args.yes || confirm({ message: '¿Aplicar y cargar el modelo?', default: true });
    },
  });

  if (args['dry-run']) out(c.y('\n--dry-run: no se aplicó nada ni se guardó preset.'));
  if (result.applied?.backups?.length) out(c.dim(`  Copias de seguridad: ${result.applied.backups.join(', ')}`));
  if (result.applied?.pendingCommands?.length) {
    out(c.y('\nPara terminar ejecuta (pide contraseña de administrador):'));
    result.applied.pendingCommands.forEach((cmd) => out(`  ${cmd}`));
  }
  const l = result.loaded;
  if (l) out(l.ok
    ? c.g(`\n✓ Modelo cargado en ${tuner.engine.name}: ${c.b(l.short.genTps + ' t/s')}${l.model ? ` (usa el modelo ${l.model})` : ''}`)
    : c.r(`\n✗ No se pudo cargar: ${l.error}`));
  if (args.json) console.log(JSON.stringify(result, null, 2));
}

async function installFlow(engineId) {
  const plans = await installPlans(engineId);
  if (!plans.length) throw new Error('No hay un instalador automático para este sistema.');
  const plan = plans.length === 1 ? plans[0] : await select({ message: 'Método de instalación:', choices: plans.map((p) => ({ name: p.label, value: p })) });
  console.log(c.dim(`  ${plan.shell || (plan.cmd ? [plan.cmd, ...plan.args].join(' ') : plan.url)}`));
  if (!args.yes && !(await confirm({ message: '¿Instalar ahora?', default: true }))) process.exit(0);
  const r = await runInstall(plan, (l) => console.log(c.dim('  ' + l)));
  if (r.manual) await input({ message: 'Instala la app descargada y pulsa Enter' });
  else if (r.code !== 0) throw new Error(`El instalador terminó con código ${r.code}`);
}

function describe(cand) {
  const where = cand.fullOffload ? 'todo en GPU' : `${cand.gpuLayers}/${cand.totalLayers} capas en GPU`;
  return `KV ${cand.kvType} · ${where}${cand.cpuMoeLayers ? ` · expertos de ${cand.cpuMoeLayers} capas en RAM` : ''} · ${cand.threads} hilos${cand.probe ? ' · prueba optimista' : ''}`;
}

function vramStr(peaks = {}) {
  const e = Object.entries(peaks || {});
  return e.length ? e.map(([i, b]) => `GPU${i} ${(b / 1024 ** 3).toFixed(1)} GB`).join(' / ') : 'n/d';
}

function parseArgs(argv) {
  const flags = new Set(['help', 'yes', 'dry-run', 'json', 'web', 'force', 'presets']);
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') o.help = true;
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    o[k] = flags.has(k) ? true : argv[++i];
  }
  return o;
}

