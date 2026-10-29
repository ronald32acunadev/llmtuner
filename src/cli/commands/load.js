import { select, input, confirm, search, Separator } from '@inquirer/prompts';
import {
  detectHardware,
  detectEngines,
  Tuner,
  installPlans,
  runInstall,
  listPresets,
  fmtBytes,
  readSettings,
  writeSettings,
  DEFAULT_PROFILE,
  TunerError,
  checkUpdate,
} from '../../core/index.js';
import { t as translate } from '../../i18n/index.js';
import { profileChoices, profileNotes, profileSwitchNote, profileEventLines, shouldAskProfile, parseContext } from '../profile.js';
import { getColors } from '../colors.js';
import { withNav, NAV_BACK, backChoice } from '../nav.js';
import { TerminalAnimation } from '../animation.js';
import { createOllamaAuthorizer } from '../../platform/ollama-authorize.js';
import { TunerApiClient } from '../../core/client.js';

export async function loadCommand(args, { lang, theme }) {
  const c = getColors(theme);
  const t = (key, params) => translate(lang, key, params);

  const describe = (cand) => {
    const where = cand.fullOffload ? t('candidate.allGpu') : t('candidate.layersGpu', { gpu: cand.gpuLayers, total: cand.totalLayers });
    return `KV ${cand.kvType} · ${where}${cand.cpuMoeLayers ? t('candidate.expertsRam', { layers: cand.cpuMoeLayers }) : ''}${t('candidate.threads', { n: cand.threads })}${cand.probe ? t('candidate.probe') : ''}`;
  };

  const benchErrorText = (b) => {
    return b.errorCode ? t(b.errorCode, b.errorParams) : b.error;
  };

  const vramStr = (peaks = {}) => {
    const e = Object.entries(peaks || {});
    return e.length ? e.map(([i, b]) => `GPU${i} ${(b / 1024 ** 3).toFixed(1)} GB`).join(' / ') : t('common.na');
  };

  const updatePromise = checkUpdate().catch(() => null);
  const isTTY = Boolean(process.stdout.isTTY && !args.json);
  const anim = new TerminalAnimation(c, isTTY);

  const out = (...a) => {
    if (args.json) return;
    anim.clear();
    console.log(...a);
  };

  out([
    '',
    `  ${c.cyan('  ╭───')}${c.dim('╷ ╷ ╷')}${c.cyan('───╮')}`,
    `  ${c.cyan('╭─┤  ')}${c.cyan('┌───┐')}${c.cyan('  ├─╮  ')}${c.b('LLM Tuner')}`,
    `  ${c.cyan('│ ')}${c.dim('╶┤')}${c.b(' │ █ │ ')}${c.dim('├╴')}${c.cyan('▲ │  ')}${c.dim(t('web.tagline'))}`,
    `  ${c.cyan('╰─┤  ')}${c.cyan('└───┘')}${c.cyan('  ├──╯')}`,
    `  ${c.cyan('  ╰───')}${c.dim('╵ ╵ ╵')}${c.cyan('───╯')}`,
    '',
  ].join('\n'));

  const updateInfo = await updatePromise;
  if (updateInfo?.updateAvailable) {
    out(c.y(`  ▲ ${t('cli.updateAvailable', { current: updateInfo.currentVersion, latest: updateInfo.latestVersion })}`));
    out(c.dim(`    ${t('cli.updateCommand', { cmd: 'npm install -g llm-tuner' })}\n`));
  }

  const settings = await readSettings();
  const isRemote = settings.activeServerId !== 'local';
  let client = null;
  let hw;
  let det;

  if (isRemote) {
    client = TunerApiClient.fromSettings(settings);
    const state = await client.getState();
    hw = state.hw;
    det = state;
  } else {
    hw = await detectHardware();
    det = await detectEngines(hw);
  }

  const cpuTitle = hw.cpu?.brand || (hw.cpu?.physicalCores ? `${hw.cpu.physicalCores} cores` : 'CPU');
  out(c.dim(`  ${cpuTitle} · ${fmtBytes(hw.ram?.totalBytes)} RAM`));
  for (const g of (hw.gpus || [])) out(c.dim(`  GPU${g.index} ${g.name} · ${fmtBytes(g.totalBytes)}${g.pcieGen ? ` · PCIe ${g.pcieGen}.0 x${g.pcieWidth}` : ''}${g.displayAttached ? t('cli.display') : ''}`));
  if (!hw.gpus?.length) out(c.y(`  ${t('cli.noGpu')}`));
  let engineId = args.engine;
  let tuner = null;
  let models = [];
  let modelKey = args.model;
  let ctx = parseContext(args.ctx);
  let profile = args.profile;

  let currentStep = 1;

  while (currentStep >= 1 && currentStep <= 4) {
    if (currentStep === 1) {
      if (args.engine) {
        engineId = args.engine;
        currentStep = 2;
        continue;
      }

      const res = await withNav(() => select({
        message: t('cli.whichEngine'),
        default: det.recommended,
        choices: [
          ...det.engines.map((e) => ({
            name: `${e.name}  ${e.detection.installed ? c.g(t('cli.installed')) + (e.detection.version ? c.dim(' v' + e.detection.version) : '') : c.dim(t('cli.notInstalled'))}${e.id === det.recommended ? c.y(`  ${t('cli.recommended')}`) : ''}`,
            value: e.id,
          })),
          new Separator(),
          backChoice(t, c),
        ],
      }));

      if (res === NAV_BACK) return;
      engineId = res;
      currentStep = 2;
    }
    else if (currentStep === 2) {
      if (!tuner || tuner.engine?.id !== engineId) {
        if (isRemote) {
          const res = await client.listModels(engineId);
          models = res.models || [];
          tuner = { engine: { id: engineId, name: engineId } };
        } else {
          if (!det.engines.find((e) => e.id === engineId)?.detection.installed) {
            await installFlow(engineId, { args, t, c });
            det = await detectEngines(hw);
            if (!det.engines.find((e) => e.id === engineId).detection.installed) throw new TunerError('errors.installNotFinished');
          }
          tuner = await Tuner.create(engineId);
          models = await tuner.listModels();
        }
      }

      if (args.model) {
        modelKey = args.model;
        currentStep = 3;
        continue;
      }

      if (!models.length) {
        out(c.y(`\n${t('cli.noModels', { engine: tuner.engine.name })}`));
        const name = await input({ message: engineId === 'ollama' ? t('cli.downloadOllama') : t('cli.downloadLms') });
        const bin = tuner.ctx.detection.bin;
        const r = await runInstall(engineId === 'ollama' ? { cmd: bin, args: ['pull', name] } : { cmd: bin, args: ['get', name, '-y'] }, (l) => out(c.dim('  ' + l)));
        if (r.code !== 0) throw new TunerError('errors.modelDownloadFailed');
        models = await tuner.listModels();
      }

      const res = await withNav(() => search({
        message: t('cli.model'),
        source: (term) => [
          backChoice(t, c),
          new Separator(),
          ...models
            .filter((m) => !term || `${m.key} ${m.name}`.toLowerCase().includes(term.toLowerCase()))
            .map((m) => ({ name: `${m.name}  ${c.dim(`${fmtBytes(m.sizeBytes)}${m.quant ? ' · ' + m.quant : ''}`)}`, value: m.key })),
        ],
      }));

      if (res === NAV_BACK) {
        if (args.engine) return;
        currentStep = 1;
        continue;
      }

      modelKey = res;
      currentStep = 3;
    }
    else if (currentStep === 3) {
      if (args.ctx) {
        ctx = parseContext(args.ctx);
        currentStep = 4;
        continue;
      }

      const presets = await listPresets({ engine: engineId, modelKey });
      const preview = await tuner.plan(modelKey, 8192);
      const limit = preview.model.meta.trainContext || 131072;
      const list = Object.entries(preview.maxContext).map(([k, v]) => `KV ${k} ${v ? Math.floor(v / 1024) + 'K' : '—'}`).join(' · ');
      out(c.dim(`  ${t('cli.maxFullGpu', { list, train: Math.floor(limit / 1024) })}`));
      if (presets.length) out(c.dim(`  ${t('cli.tunedContexts', { list: presets.map((p) => `${p.ctx / 1024}K (${p.shortTps} t/s)`).join(', ') })}`));

      let inputBuffer = '';
      const res = await withNav(() => input({
        message: `${t('cli.context')} ${c.dim(`(Backspace: ${t('common.back')})`)}`,
        default: String(presets.at(-1)?.ctx || Math.min(16384, limit)),
        validate: (v) => {
          inputBuffer = v;
          if (v.toLowerCase() === 'b' || v.toLowerCase() === 'back') return true;
          return parseContext(v, limit) !== null || t('cli.contextRange', { limit });
        },
      }), { isTextInput: true, getInputValue: () => inputBuffer });

      if (res === NAV_BACK || res?.toLowerCase?.() === 'b' || res?.toLowerCase?.() === 'back') {
        if (args.model) {
          if (args.engine) return;
          currentStep = 1;
        } else {
          currentStep = 2;
        }
        continue;
      }

      ctx = parseContext(res, limit);
      currentStep = 4;
    }
    else if (currentStep === 4) {
      if (args.profile || !shouldAskProfile(args)) {
        profile = args.profile || DEFAULT_PROFILE;
        break;
      }

      const plan = await tuner.profilePlan(modelKey, ctx);
      const { profile: stored } = await readSettings();
      for (const line of profileNotes(plan, t)) {
        out((line.level === 'warn' ? c.y : c.dim)(`  ${line.text}`));
      }

      const choicesObj = profileChoices(plan, t, { stored, mark: c.y, dim: c.dim });
      const res = await withNav(() => select({
        message: t('cli.profile'),
        ...choicesObj,
        choices: [
          ...choicesObj.choices,
          new Separator(),
          backChoice(t, c),
        ],
      }));

      if (res === NAV_BACK) {
        if (args.ctx) {
          if (args.model) {
            if (args.engine) return;
            currentStep = 1;
          } else {
            currentStep = 2;
          }
        } else {
          currentStep = 3;
        }
        continue;
      }

      profile = res;
      try {
        await writeSettings({ profile });
      } catch (e) {
        console.error(c.y(t('cli.profileNotSaved', { error: e.message })));
      }
      const switchNote = profileSwitchNote(plan, profile, t, tuner.engine.name);
      if (switchNote) out(c.dim(`  ${switchNote}`));
      break;
    }
  }

  // 5. Load & Benchmark Execution with Desktop-style live animation
  if (!tuner) {
    tuner = await Tuner.create(engineId);
  }

  const advisedByWizard = !args.profile;
  let previous = null;

  anim.start(t('status.loading'));

  tuner.on('progress', (e) => {
    if (args.json) return;

    if (e.type === 'telemetry') {
      anim.updateTelemetry(e);
      return;
    }
    if (e.progress) {
      anim.updateProgress(e.progress.pct);
    }
    if (e.type === 'variant-picked' || e.type === 'profile-fallback') {
      for (const line of profileEventLines(e, previous, t, advisedByWizard ? null : tuner.engine.name)) {
        out((line.level === 'warn' ? c.y : c.dim)(`  ${line.text}`));
      }
    }
    previous = e;
    if (e.type === 'status') {
      anim.updateStatus(t(e.code, e.params));
      out(c.dim(`\n${t(e.code, e.params)}`));
    }
    if (e.type === 'preset-hit') {
      out(c.g(`\n✓ ${t('cli.presetHit', { date: e.preset.createdAt.slice(0, 10), config: describe(e.preset.candidate), tps: e.preset.bench.short.genTps })}`));
    }
    if (e.type === 'candidate-start') {
      anim.updateStatus(`[${e.index + 1}/${e.total}] ${describe(e.candidate)}`);
      out(`  [${e.index + 1}/${e.total}] ${describe(e.candidate)}`);
    }
    if (e.type === 'bench-progress' && e.phase === 'deep') {
      out(c.dim(`      ${t('common.longPrompt', { tokens: e.promptTokens })}`));
    }
    if (e.type === 'candidate-done') {
      const b = e.bench;
      out(b.ok
        ? `      ${c.g('✓')} ${t('cli.benchShort', { tps: c.b(b.short.genTps + ' t/s') })}${b.deep ? t('cli.benchDeep', { tps: c.b(b.deep.genTps + ' t/s'), tokens: b.deep.promptTokens }) : ''} · CPU ${b.cpu.avg}% · VRAM ${vramStr(b.vramPeakBytes)}`
        : c.r(`      ✗ ${benchErrorText(b)}`));
    }
    if (e.type === 'preset-saved') {
      out(c.g(`\n✓ ${t('common.presetSaved', { file: e.file })}`));
    }
  });

  let result;
  try {
    if (isRemote) {
      result = await client.loadModel({
        engine: engineId,
        model: modelKey,
        ctx,
        profile,
        force: !!args.force,
        candidates: Number(args.candidates) || 3,
      }, (e) => {
        if (e.type === 'progress') anim.update(e);
        if (e.type === 'log') out(c.dim('  ' + e.line));
      });
    } else {
      result = await tuner.load(modelKey, ctx, {
        authorizeOllama: createOllamaAuthorizer({
          mode: process.stdin.isTTY && process.stderr.isTTY && !args.json ? 'terminal' : 'noninteractive',
          beforePrompt: () => anim.stop(),
          afterPrompt: () => anim.start(t('status.applying')),
        }),
        profile,
        force: !!args.force,
        dryRun: !!args['dry-run'],
        maxCandidates: Number(args.candidates) || 3,
        confirmApply: async (preview) => {
          anim.stop();
          out(c.b(`\n${t('cli.changes')}`));
          if (engineId === 'lmstudio') {
            preview.files.forEach((f) => out(`  ${f}`));
            if (preview.restartsApp) out(c.y(`  ${t('cli.lmsRestart')}`));
          } else {
            out(`  ${t('cli.ollamaNewModel', { name: c.b(preview.tunedModel) })}`);
            out(`  ${t('cli.ollamaServer', { env: Object.entries(preview.env).map(([k, v]) => `${k}=${v}`).join(' ') })}`);
          }
          const confirmed = args.yes || await confirm({ message: t('cli.confirmApply'), default: true });
          if (confirmed) anim.start(t('status.applying'));
          return confirmed;
        },
      });
    }
  } catch (e) {
    if (!/^errors\.ollama(?:Service|Authorization)/.test(e.code || '')) throw e;
    if (args.json) {
      console.log(JSON.stringify({ ok: false, code: e.code, params: e.params || {}, error: t(e.code, e.params) }));
      process.exitCode = 1;
      return;
    }
    e.message = t(e.code, e.params);
    throw e;
  } finally {
    anim.stop();
  }

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

async function installFlow(engineId, { args, t, c }) {
  const plans = await installPlans(engineId);
  if (!plans.length) throw new TunerError('errors.noInstaller');
  const plan = plans.length === 1 ? plans[0] : await select({ message: t('cli.installMethod'), choices: plans.map((p) => ({ name: t(p.labelCode), value: p })) });
  console.log(c.dim(`  ${plan.shell || (plan.cmd ? [plan.cmd, ...plan.args].join(' ') : plan.url)}`));
  if (!args.yes && !(await confirm({ message: t('cli.installNow'), default: true }))) process.exit(0);
  const r = await runInstall(plan, (l) => console.log(c.dim('  ' + l)));
  if (r.manual) await input({ message: t('cli.installManual') });
  else if (r.code !== 0) throw new TunerError('errors.installerExit', { code: r.code });
}
