import { ENGINES, detectHardware } from '../../core/index.js';
import { t as translate } from '../../i18n/index.js';
import { getColors } from '../colors.js';

export async function enginesCommand(args = {}, { lang = 'en', theme = 'dark' } = {}) {
  const c = getColors(theme);
  const t = (k, p) => translate(lang, k, p);
  const hw = await detectHardware();

  if (args.path) {
    const targetEngine = args.engine || 'ollama';
    const engine = ENGINES[targetEngine];
    const detection = await engine.detect(hw);
    const res = typeof engine.setModelsDir === 'function' ? await engine.setModelsDir({ detection, hw }, args.path) : { ok: true, requiresRestart: true };
    console.log(t('cli.storagePathUpdated', { path: args.path }));
    if (res.requiresRestart) console.log(c.y(t('cli.restartRequiredNotice', { engine: targetEngine })));
    if (res.manualCommand) console.log(c.dim(res.manualCommand));
    return res;
  }

  const summaries = [];
  for (const [id, engine] of Object.entries(ENGINES)) {
    const detection = await engine.detect(hw);
    const isRunning = !!(detection.serverRunning || detection.appRunning);
    const statusBadge = isRunning ? c.g(t('web.statusRunning')) : c.dim(t('web.statusStopped'));
    console.log(`${c.b(engine.name || id)} [${statusBadge}] ${detection.version ? 'v' + detection.version : ''} (${detection.apiUrl || '-'})`);
    console.log(`  ${t('cli.storagePathTitle', { engine: engine.name || id, path: detection.modelsDir || detection.home || '-' })}`);
    summaries.push({ id, name: engine.name, running: isRunning, modelsDir: detection.modelsDir });
  }
  return summaries;
}
