import { input, select } from '@inquirer/prompts';
import { getActiveServer, readSettings, Tuner } from '../../core/index.js';
import { TunerApiClient } from '../../core/client.js';
import { t as translate } from '../../i18n/index.js';
import { getColors } from '../colors.js';
import { NAV_BACK, backChoice, withNav } from '../nav.js';

const SUPPORTED_ENGINES = ['lmstudio', 'ollama'];

export async function chatCommand(args = {}, { lang, theme }, dependencies = {}) {
  const {
    readSettings: loadSettings = readSettings,
    createTuner = (engine) => Tuner.create(engine),
    createClient = (server) => new TunerApiClient({ baseUrl: server.url, token: server.token }),
    inputPrompt = input,
    selectPrompt = select,
    log = console.log,
    isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  } = dependencies;
  const c = getColors(theme);
  const t = (key, params) => translate(lang, key, params);
  let { engine, model } = args;
  const { prompt, json } = args;

  if (!isInteractive && (!engine || !model || !prompt)) {
    throw new Error(t('cli.chatIncomplete'));
  }
  if (engine && !SUPPORTED_ENGINES.includes(engine)) {
    throw new Error(t('errors.unknownEngine', { engine }));
  }

  const settings = await loadSettings();
  const active = getActiveServer(settings);
  const isRemote = active.id !== 'local';

  if (!engine) {
    engine = await withNav(() => selectPrompt({
      message: t('cli.chatEngine'),
      choices: [
        { name: 'LM Studio', value: 'lmstudio' },
        { name: 'Ollama', value: 'ollama' },
        backChoice(t, c),
      ],
    }));
    if (engine === NAV_BACK) return;
  }

  const backend = isRemote ? createClient(active) : await createTuner(engine);

  if (!model) {
    const listed = isRemote ? await backend.listModels(engine) : await backend.listModels();
    const models = Array.isArray(listed) ? listed : (listed?.models ?? []);
    if (models.length === 0) {
      throw new Error(t('cli.chatNoModels'));
    }
    model = await withNav(() => selectPrompt({
      message: t('cli.chatModel'),
      choices: [
        ...models.map((item) => {
          const key = item.key || item.id || item.name;
          return { name: item.name || key, value: key };
        }),
        backChoice(t, c),
      ],
    }));
    if (model === NAV_BACK) return;
  }

  const send = (messages) => (isRemote
    ? backend.chat({ engine, model, messages })
    : backend.chat(model, messages));

  if (prompt) {
    const response = await send([{ role: 'user', content: prompt }]);
    log(json ? JSON.stringify(response) : (response?.message?.content ?? ''));
    return response;
  }

  const history = [];
  while (true) {
    let buffer = '';
    const text = await withNav(() => inputPrompt({
      message: t('cli.chatPrompt'),
      transformer: (value) => {
        buffer = value;
        return value;
      },
    }), { isTextInput: true, getInputValue: () => buffer });
    if (text === NAV_BACK) return;

    const trimmed = text.trim();
    if (trimmed === '/exit') return;
    if (!trimmed) continue;

    history.push({ role: 'user', content: trimmed });
    let response;
    try {
      response = await send(structuredClone(history));
    } catch (err) {
      history.pop();
      throw err;
    }
    const content = response?.message?.content ?? '';
    history.push({ role: 'assistant', content });
    log(content);
  }
}
