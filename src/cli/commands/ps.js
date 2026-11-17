import { ENGINES, detectHardware } from '../../core/index.js';
import { t as translate } from '../../i18n/index.js';
import { getColors } from '../colors.js';

const GiB = 1024 ** 3;
const fmtBytes = (b) => (b ? (b / GiB).toFixed(2) + ' GB' : '-');

export function formatTtl(expiresAt) {
  if (!expiresAt) return '-';
  const sec = Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000);
  if (sec <= 0) return 'expired';
  if (sec < 60) return `${sec}s`;
  return `${Math.round(sec / 60)}m`;
}

export async function psCommand(args = {}, { lang = 'en', theme = 'dark', engines = ENGINES, detectHw = detectHardware } = {}) {
  const c = getColors(theme);
  const t = (k, p) => translate(lang, k, p);
  const hw = await detectHw();

  const allActive = [];
  const enginesToCheck = args.engine
    ? Object.entries(engines).filter(([id]) => id === args.engine)
    : Object.entries(engines);

  for (const [id, engine] of enginesToCheck) {
    const detection = await engine.detect(hw);
    if (detection?.serverRunning || detection?.appRunning) {
      const list = typeof engine.ps === 'function' ? await engine.ps({ detection, hw }) : [];
      for (const m of list) {
        allActive.push({
          engine: id,
          name: m.name || m.model,
          sizeVram: m.sizeVram ?? m.sizeBytes ?? null,
          quant: m.details?.quantization_level || m.quant || '',
          expiresAt: m.expiresAt || null
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

  const header = `${c.b(t('cli.psColEngine').padEnd(10))} ${c.b(t('cli.psColModel').padEnd(32))} ${c.b(t('cli.psColVram').padEnd(10))} ${c.b(t('cli.psColQuant').padEnd(10))} ${c.b(t('cli.psColExpires'))}`;
  const separator = c.dim('─'.repeat(75));

  console.log(header);
  console.log(separator);

  for (const m of allActive) {
    const quantStr = (m.quant || '-').padEnd(10);
    const row = `${m.engine.padEnd(10)} ${m.name.padEnd(32)} ${fmtBytes(m.sizeVram).padEnd(10)} ${quantStr} ${formatTtl(m.expiresAt)}`;
    console.log(row);
  }

  return allActive;
}
