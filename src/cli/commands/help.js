import { presetsDir } from '../../core/index.js';
import { t as translate } from '../../i18n/index.js';

export async function helpCommand(args, { lang }) {
  const t = (key, params) => translate(lang, key, params);
  console.log(t('cli.help', { presetsDir: presetsDir() }));
}
