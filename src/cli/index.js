#!/usr/bin/env node
import { select, input, confirm, search } from '@inquirer/prompts';
import { detectHardware, detectEngines, Tuner, installPlans, runInstall, listPresets, presetsDir, fmtBytes, readSettings, writeSettings, TunerError } from '../core/index.js';
import { t as translate, LOCALES, errorText } from '../i18n/index.js';

const args = parseArgs(process.argv.slice(2));
const c = {
  b: (s) => `\x1b[1m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`,
};

let lang = (await readSettings()).lang;
const t = (key, params) => translate(lang, key, params);
if ('lang' in args) {
  if (!LOCALES.includes(args.lang)) {
    console.error(translate('en', 'errors.unknownLocale', { lang: args.lang ?? '', list: LOCALES.join(', ') }));
    process.exit(1);
  }
  lang = args.lang;
  try { await writeSettings({ lang }); } catch (e) { console.error(c.y(t('cli.langNotSaved', { error: e.message }))); }
}

if (args.help) {
  console.log(t('cli.help', { presetsDir: presetsDir() }));
  process.exit(0);
}

if (args.web) {
  await import('../web/server.js').then((m) => m.startServer({ open: true }));
} else if (args.presets) {
  const list = await listPresets({ engine: args.engine, modelKey: args.model });
  if (!list.length) console.log(t('cli.noPresets'));
  for (const p of list) console.log(`${p.engine.padEnd(9)} ${p.model}  ${p.ctx / 1024}K  KV ${p.kvType}  ${p.fullOffload ? t('candidate.allGpu') : t('cli.partial')}  ${p.shortTps} t/s  ${c.dim(p.createdAt.slice(0, 16).replace('T', ' '))}`);
} else {
  main().catch((e) => {
    if (e?.name === 'ExitPromptError') process.exit(130);
    console.error(c.r(`\n${t('common.error', { message: errorText(lang, e) })}`));
    process.exit(1);
  });
}

async function main() {
  const out = (...a) => { if (!args.json) console.log(...a); };
  out(c.b('\n⚙  LLM Tuner'));

  const hw = await detectHardware();
  out(c.dim(`  ${hw.cpu.brand} · ${fmtBytes(hw.ram.totalBytes)} RAM`));
  for (const g of hw.gpus) out(c.dim(`  GPU${g.index} ${g.name} · ${fmtBytes(g.totalBytes)}${g.pcieGen ? ` · PCIe ${g.pcieGen}.0 x${g.pcieWidth}` : ''}${g.displayAttached ? t('cli.display') : ''}`));
  if (!hw.gpus.length) out(c.y(`  ${t('cli.noGpu')}`));

  // 1. Engine
  let det = await detectEngines(hw);
  let engineId = args.engine;
  if (!engineId) {
    engineId = await select({
      message: t('cli.whichEngine'),
      default: det.recommended,
      choices: det.engines.map((e) => ({
        name: `${e.name}  ${e.detection.installed ? c.g(t('cli.installed')) + (e.detection.version ? c.dim(' v' + e.detection.version) : '') : c.dim(t('cli.notInstalled'))}${e.id === det.recommended ? c.y(`  ${t('cli.recommended')}`) : ''}`,
        value: e.id,
      })),
    });
  }
  if (!det.engines.find((e) => e.id === engineId)?.detection.installed) {
    await installFlow(engineId);
    det = await detectEngines(hw);
    if (!det.engines.find((e) => e.id === engineId).detection.installed) throw new TunerError('errors.installNotFinished');
  }
  const tuner = await Tuner.create(engineId);

  // 2. Model
  let models = await tuner.listModels();
  if (!models.length) {
    out(c.y(`\n${t('cli.noModels', { engine: tuner.engine.name })}`));
    const name = await input({ message: engineId === 'ollama' ? t('cli.downloadOllama') : t('cli.downloadLms') });
    const bin = tuner.ctx.detection.bin;
    const r = await runInstall(engineId === 'ollama' ? { cmd: bin, args: ['pull', name] } : { cmd: bin, args: ['get', name, '-y'] }, (l) => out(c.dim('  ' + l)));
    if (r.code !== 0) throw new TunerError('errors.modelDownloadFailed');
    models = await tuner.listModels();
  }
  const modelKey = args.model || await search({
    message: t('cli.model'),
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
    const list = Object.entries(preview.maxContext).map(([k, v]) => `KV ${k} ${v ? Math.floor(v / 1024) + 'K' : '—'}`).join(' · ');
    out(c.dim(`  ${t('cli.maxFullGpu', { list, train: Math.floor(limit / 1024) })}`));
    if (presets.length) out(c.dim(`  ${t('cli.tunedContexts', { list: presets.map((p) => `${p.ctx / 1024}K (${p.shortTps} t/s)`).join(', ') })}`));
    ctx = Number(await input({
      message: t('cli.context'),
      default: String(presets.at(-1)?.ctx || Math.min(16384, limit)),
      validate: (v) => (Number(v) >= 512 && Number(v) <= limit) || t('cli.contextRange', { limit }),
    }));
  }

  // 4. Load (preset or benchmark)
  tuner.on('progress', (e) => {
    if (args.json) return;
    if (e.type === 'status') out(c.dim(`\n${t(e.code, e.params)}`));
    if (e.type === 'preset-hit') out(c.g(`\n✓ ${t('cli.presetHit', { date: e.preset.createdAt.slice(0, 10), config: describe(e.preset.candidate), tps: e.preset.bench.short.genTps })}`));
    if (e.type === 'candidate-start') out(`  [${e.index + 1}/${e.total}] ${describe(e.candidate)}`);
    if (e.type === 'bench-progress' && e.phase === 'deep') out(c.dim(`      ${t('common.longPrompt', { tokens: e.promptTokens })}`));
    if (e.type === 'candidate-done') {
      const b = e.bench;
      out(b.ok ? `      ${c.g('✓')} ${t('cli.benchShort', { tps: c.b(b.short.genTps + ' t/s') })}${b.deep ? t('cli.benchDeep', { tps: c.b(b.deep.genTps + ' t/s'), tokens: b.deep.promptTokens }) : ''} · CPU ${b.cpu.avg}% · VRAM ${vramStr(b.vramPeakBytes)}` : c.r(`      ✗ ${benchErrorText(b)}`));
    }
    if (e.type === 'preset-saved') out(c.g(`\n✓ ${t('common.presetSaved', { file: e.file })}`));
  });

  const result = await tuner.load(modelKey, ctx, {
    force: !!args.force,
    dryRun: !!args['dry-run'],
    maxCandidates: Number(args.candidates) || 3,
    confirmApply: async (preview) => {
      out(c.b(`\n${t('cli.changes')}`));
      if (engineId === 'lmstudio') {
        preview.files.forEach((f) => out(`  ${f}`));
        if (preview.restartsApp) out(c.y(`  ${t('cli.lmsRestart')}`));
      } else {
        out(`  ${t('cli.ollamaNewModel', { name: c.b(preview.tunedModel) })}`);
        out(`  ${t('cli.ollamaServer', { env: Object.entries(preview.env).map(([k, v]) => `${k}=${v}`).join(' ') })}`);
      }
      return args.yes || confirm({ message: t('cli.confirmApply'), default: true });
    },
  });

  if (args['dry-run']) out(c.y(`\n${t('cli.dryRun')}`));
  if (result.applied?.backups?.length) out(c.dim(`  ${t('common.backups', { list: result.applied.backups.join(', ') })}`));
  if (result.applied?.pendingCommands?.length) {
    out(c.y(`\n${t('cli.pending')}`));
    result.applied.pendingCommands.forEach((cmd) => out(`  ${cmd}`));
  }
  const l = result.loaded;
  if (l) out(l.ok
    ? c.g(`\n✓ ${t('cli.loaded', { engine: tuner.engine.name, tps: c.b(l.short.genTps + ' t/s') })}${l.model ? t('cli.usesModel', { model: l.model }) : ''}`)
    : c.r(`\n✗ ${t('cli.loadFailed', { error: benchErrorText(l) })}`));
  if (args.json) console.log(JSON.stringify(result, null, 2));
}

async function installFlow(engineId) {
  const plans = await installPlans(engineId);
  if (!plans.length) throw new TunerError('errors.noInstaller');
  const plan = plans.length === 1 ? plans[0] : await select({ message: t('cli.installMethod'), choices: plans.map((p) => ({ name: t(p.labelCode), value: p })) });
  console.log(c.dim(`  ${plan.shell || (plan.cmd ? [plan.cmd, ...plan.args].join(' ') : plan.url)}`));
  if (!args.yes && !(await confirm({ message: t('cli.installNow'), default: true }))) process.exit(0);
  const r = await runInstall(plan, (l) => console.log(c.dim('  ' + l)));
  if (r.manual) await input({ message: t('cli.installManual') });
  else if (r.code !== 0) throw new TunerError('errors.installerExit', { code: r.code });
}

function describe(cand) {
  const where = cand.fullOffload ? t('candidate.allGpu') : t('candidate.layersGpu', { gpu: cand.gpuLayers, total: cand.totalLayers });
  return `KV ${cand.kvType} · ${where}${cand.cpuMoeLayers ? t('candidate.expertsRam', { layers: cand.cpuMoeLayers }) : ''}${t('candidate.threads', { n: cand.threads })}${cand.probe ? t('candidate.probe') : ''}`;
}

function benchErrorText(b) {
  return b.errorCode ? t(b.errorCode, b.errorParams) : b.error;
}

function vramStr(peaks = {}) {
  const e = Object.entries(peaks || {});
  return e.length ? e.map(([i, b]) => `GPU${i} ${(b / 1024 ** 3).toFixed(1)} GB`).join(' / ') : t('common.na');
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
