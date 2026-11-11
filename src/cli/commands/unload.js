import { select } from '@inquirer/prompts';
import { withNav, isNavBack, backChoice } from '../nav.js';
import { ENGINES, detectHardware } from '../../core/index.js';
import { t as translate } from '../../i18n/index.js';
import { getColors } from '../colors.js';

export async function unloadCommand(args = {}, { lang = 'en', theme = 'dark' } = {}) {
  const c = getColors(theme);
  const t = (k, p) => translate(lang, k, p);
  const hw = await detectHardware();

  const activeModels = [];
  for (const [engineId, engine] of Object.entries(ENGINES)) {
    const detection = await engine.detect(hw);
    if (detection.serverRunning || detection.appRunning) {
      const list = typeof engine.ps === 'function' ? await engine.ps({ detection, hw }) : [];
      for (const m of list) {
        activeModels.push({
          engineId,
          engine,
          detection,
          model: m.name || m.model
        });
      }
    }
  }

  if (args.model) {
    let target = activeModels.find(m => m.model === args.model);
    if (!target) {
      // If not detected in active list, try specified or default engine
      const engineId = args.engine || 'ollama';
      const engine = ENGINES[engineId];
      if (engine) {
        const detection = await engine.detect(hw);
        target = { engineId, engine, detection, model: args.model };
      }
    }
    if (target) {
      await target.engine.unload({ detection: target.detection, hw }, args.model);
      console.log(t('cli.modelUnloadedSuccess', { model: args.model, engine: target.engineId }));
      return { ok: true, unloaded: args.model };
    }
    console.log(t('cli.modelNotFound', { model: args.model }));
    return { ok: false, error: 'Model not found' };
  }

  if (activeModels.length === 0) {
    console.log(t('cli.noActiveModels'));
    return { ok: true, unloaded: null };
  }

  const choices = activeModels.map(m => ({
    name: `${m.engineId.padEnd(8)} ${m.model}`,
    value: m
  })).concat([backChoice(t, c)]);

  const result = await withNav(() => select({
    message: t('cli.selectModelToUnload'),
    choices
  }));

  if (isNavBack(result)) {
    return { ok: false, cancelled: true };
  }

  await result.engine.unload({ detection: result.detection, hw }, result.model);
  console.log(t('cli.modelUnloadedSuccess', { model: result.model, engine: result.engineId }));
  return { ok: true, unloaded: result.model };
}
