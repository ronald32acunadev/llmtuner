import { listPresets } from '../../core/index.js';
import { t as translate } from '../../i18n/index.js';
import { getColors } from '../colors.js';

export async function presetsCommand(args, { lang, theme }) {
  const c = getColors(theme);
  const t = (key, params) => translate(lang, key, params);

  const list = await listPresets({ engine: args.engine, modelKey: args.model });
  if (!list.length) {
    console.log(t('cli.noPresets'));
    return;
  }

  for (const p of list) {
    const profileStr = p.profile ? `  ${p.profile}${p.variant && p.variant !== p.model ? ` (${p.variant})` : ''}` : '';
    const offloadStr = p.fullOffload ? t('candidate.allGpu') : t('cli.partial');
    const dateStr = c.dim(p.createdAt.slice(0, 16).replace('T', ' '));
    console.log(`${p.engine.padEnd(9)} ${p.model}  ${p.ctx / 1024}K${profileStr}  KV ${p.kvType}  ${offloadStr}  ${p.shortTps} t/s  ${dateStr}`);
  }
}
