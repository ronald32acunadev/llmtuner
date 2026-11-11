import { ENGINES, detectHardware } from '../../core/index.js';
import { t as translate } from '../../i18n/index.js';
import { getColors } from '../colors.js';

const GiB = 1024 ** 3;
const fmtBytes = (b) => (b ? (b / GiB).toFixed(2) + ' GB' : '-');

export async function psCommand(args = {}, { lang = 'en', theme = 'dark' } = {}) {
  const c = getColors(theme);
  const t = (k, p) => translate(lang, k, p);
  const hw = await detectHardware();

  const allActive = [];
  const enginesToCheck = args.engine
    ? Object.entries(ENGINES).filter(([id]) => id === args.engine)
    : Object.entries(ENGINES);

  for (const [id, engine] of enginesToCheck) {
    const detection = await engine.detect(hw);
    if (detection.serverRunning || detection.appRunning) {
      const list = typeof engine.ps === 'function' ? await engine.ps({ detection, hw }) : [];
      for (const m of list) {
        allActive.push({
          engine: id,
          name: m.name || m.model,
          sizeVram: m.sizeVram,
          quant: m.details?.quantization_level || m.quant || ''
        });
      }
    }
  }

  if (args.json) {
    console.log(JSON.stringify({ ok: true, active: allActive }));
    return allActive;
  }

  if (allActive.length === 0) {
    console.log(t('cli.noActiveModels'));
    return allActive;
  }

  const header = `${c.b('Engine'.padEnd(10))} ${c.b('Model'.padEnd(32))} ${c.b('VRAM'.padEnd(10))} ${c.b('Quant')}`;
  const separator = c.dim('─'.repeat(60));

  console.log(header);
  console.log(separator);

  for (const m of allActive) {
    const row = `${m.engine.padEnd(10)} ${m.name.padEnd(32)} ${fmtBytes(m.sizeVram).padEnd(10)} ${m.quant}`;
    console.log(row);
  }

  return allActive;
}
