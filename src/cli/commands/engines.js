import { select, input } from '@inquirer/prompts';
import { withNav, isNavBack, backChoice } from '../nav.js';
import { ENGINES, detectHardware } from '../../core/index.js';
import { t as translate } from '../../i18n/index.js';
import { getColors } from '../colors.js';

export async function enginesCommand(
  args = {},
  {
    lang = 'en',
    theme = 'dark',
    interactive = false,
    engines = ENGINES,
    detectHw = detectHardware,
    selectPrompt = select,
    inputPrompt = input
  } = {}
) {
  const c = getColors(theme);
  const t = (k, p) => translate(lang, k, p);
  const hw = await detectHw();

  if (args.path) {
    const targetEngine = args.engine || 'ollama';
    const engine = engines[targetEngine];
    if (!engine) {
      const err = `Unknown engine: ${targetEngine}`;
      if (args.json) {
        console.log(JSON.stringify({ ok: false, error: err }));
      } else {
        console.error(err);
      }
      return { ok: false, error: err };
    }

    const detection = await engine.detect(hw);
    const res = typeof engine.setModelsDir === 'function'
      ? await engine.setModelsDir({ detection, hw }, args.path)
      : { ok: true, path: args.path, requiresRestart: true };

    if (args.json) {
      console.log(JSON.stringify({ ok: res.ok, engine: targetEngine, ...res }));
      return res;
    }

    if (res?.ok) {
      console.log(t('cli.storagePathUpdated', { path: res.path || args.path }));
      if (res.requiresRestart) {
        console.log(c.y(t('cli.restartRequiredNotice', { engine: engine.name || targetEngine })));
      }
    } else if (res?.manualCommand) {
      console.log(c.y(t('cli.storagePrivilegedNotice')));
      console.log(c.dim(`\n  ${res.manualCommand}\n`));
    }
    if (res?.warning) {
      console.log(c.y(t(res.warning, { path: res.path || args.path })));
    }
    return res;
  }

  async function getSummaries() {
    const summaries = [];
    const enginesToCheck = args.engine
      ? Object.entries(engines).filter(([id]) => id === args.engine)
      : Object.entries(engines);

    for (const [id, engine] of enginesToCheck) {
      const detection = await engine.detect(hw);
      const isRunning = !!(detection.serverRunning || detection.appRunning);
      summaries.push({
        id,
        name: engine.name || id,
        installed: !!detection.installed,
        running: isRunning,
        version: detection.version || null,
        apiUrl: detection.apiUrl || null,
        modelsDir: detection.modelsDir || detection.home || null
      });
    }
    return summaries;
  }

  function printSummaries(summaries) {
    for (const s of summaries) {
      const statusBadge = s.running ? c.g(t('web.statusRunning')) : c.dim(t('web.statusStopped'));
      console.log(`${c.b(s.name)} [${statusBadge}] ${s.version ? 'v' + s.version : ''} (${s.apiUrl || '-'})`);
      console.log(`  ${t('cli.storagePathTitle', { engine: s.name, path: s.modelsDir || '-' })}`);
    }
  }

  if (args.json) {
    const summaries = await getSummaries();
    console.log(JSON.stringify({ ok: true, engines: summaries }));
    return summaries;
  }

  if (!interactive) {
    const summaries = await getSummaries();
    printSummaries(summaries);
    return summaries;
  }

  const summaries = await getSummaries();
  while (true) {
    const action = await withNav(() => selectPrompt({
      message: t('cli.enginesMenuTitle'),
      choices: [
        { name: t('cli.enginesInspect'), value: 'inspect' },
        { name: t('cli.enginesListModels'), value: 'models' },
        { name: t('cli.enginesConfigStorage'), value: 'storage' },
        backChoice(t, c)
      ]
    }));

    if (isNavBack(action)) {
      return summaries;
    }

    if (action === 'inspect') {
      const freshSummaries = await getSummaries();
      printSummaries(freshSummaries);
    } else if (action === 'models') {
      const engineChoices = Object.entries(engines).map(([id, eng]) => ({
        name: eng.name || id,
        value: id
      })).concat([backChoice(t, c)]);

      const pickedEngineId = await withNav(() => selectPrompt({
        message: t('cli.whichEngine'),
        choices: engineChoices
      }));

      if (!isNavBack(pickedEngineId)) {
        const engine = engines[pickedEngineId];
        const detection = await engine.detect(hw);
        const models = typeof engine.listModels === 'function'
          ? await engine.listModels({ detection, hw })
          : [];
        if (!models || models.length === 0) {
          console.log(t('cli.noModels', { engine: engine.name || pickedEngineId }));
        } else {
          for (const m of models) {
            console.log(`  • ${m.name || m.model || m.id || m}`);
          }
        }
      }
    } else if (action === 'storage') {
      const engineChoices = Object.entries(engines).map(([id, eng]) => ({
        name: eng.name || id,
        value: id
      })).concat([backChoice(t, c)]);

      const pickedEngineId = await withNav(() => selectPrompt({
        message: t('cli.whichEngine'),
        choices: engineChoices
      }));

      if (!isNavBack(pickedEngineId)) {
        const engine = engines[pickedEngineId];
        const detection = await engine.detect(hw);
        let buffer = '';
        const newPath = await withNav(() => inputPrompt({
          message: t('cli.enginesPromptPath'),
          default: detection.modelsDir || detection.home || '',
          transformer: (v) => { buffer = v; return v; }
        }), { isTextInput: true, getInputValue: () => buffer });

        if (!isNavBack(newPath) && newPath?.trim()) {
          const trimmedPath = newPath.trim();
          const res = typeof engine.setModelsDir === 'function'
            ? await engine.setModelsDir({ detection, hw }, trimmedPath)
            : { ok: true, path: trimmedPath, requiresRestart: true };
          if (res?.ok) {
            console.log(t('cli.storagePathUpdated', { path: res.path || trimmedPath }));
            if (res.requiresRestart) {
              console.log(c.y(t('cli.restartRequiredNotice', { engine: engine.name || pickedEngineId })));
            }
          } else if (res?.manualCommand) {
            console.log(c.y(t('cli.storagePrivilegedNotice')));
            console.log(c.dim(`\n  ${res.manualCommand}\n`));
          }
          if (res?.warning) {
            console.log(c.y(t(res.warning, { path: res.path || trimmedPath })));
          }
        }
      }
    }
  }
}
