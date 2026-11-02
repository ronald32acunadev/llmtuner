# @inquirer/prompts 7.10.1 dictionary

Sources: Context7 /sboudrias/inquirer.js package READMEs, plus installed node_modules/@inquirer/*/dist/esm/index.d.ts (authoritative for this version).

```js
import { input, select, confirm, checkbox, password, Separator } from '@inquirer/prompts';
```
- `input({ message, default, required, transformer, validate, pattern, patternError })` returns Promise<string>. `validate` returns `true` or an error string. A normalized string counts as an ERROR.
- `transformer: (value, { isFinal }) => string` only changes the display. The project also uses it to track live text.
- `select({ message, choices, default, pageSize, loop })` returns the chosen `value`. A choice is `{ value, name, description, short, disabled }`. `new Separator()` goes inside `choices`.
- `checkbox({ message, choices, required, validate })` returns an array of values. Project code sets `checked` on choices.
- `confirm({ message, default })` returns a boolean.
- `password({ message, mask, validate })` has no transformer.

## Project wrappers, src/cli/nav.js
- `withNav(factory, { isTextInput, getInputValue })` takes a FUNCTION that creates the prompt and returns its answer, or `NAV_BACK` when the user goes back.
- `backChoice(t, c)` returns `{ name, value: NAV_BACK }`. `NAV_BACK` is a Symbol: do not `join` choice values without `String`.
```js
let buffer = '';
const text = await withNav(() => inputPrompt({
  message: t('cli.chatPrompt'),
  transformer: (value) => { buffer = value; return value; },
}), { isTextInput: true, getInputValue: () => buffer });
if (text === NAV_BACK) return;
const engine = await withNav(() => selectPrompt({ message, choices: [{ name: 'Ollama', value: 'ollama' }, backChoice(t, c)] }));
```
- WRONG: `selectPrompt(withNav(...))`, `backChoice(translate, 'back')`, `translate('key')` without lang.
- Translation helper: `const t = (key, params) => translate(lang, key, params);`, colors: `const c = getColors(theme);`.
