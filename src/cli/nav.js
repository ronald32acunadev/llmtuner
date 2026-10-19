import { CancelPromptError } from '@inquirer/core';

export const NAV_BACK = Symbol('NAV_BACK');

export function isNavBack(val) {
  return val === NAV_BACK;
}

export function backChoice(t, c) {
  const label = t ? t('common.back') : 'Back';
  const text = `← ${label} (Backspace)`;
  return {
    name: c ? c.dim(text) : text,
    value: NAV_BACK,
  };
}

/**
 * Runs an Inquirer prompt with keyboard navigation support (Backspace / Escape to go back).
 * If the user presses Backspace or Escape, or if the prompt is cancelled, returns NAV_BACK.
 *
 * @param {Function} promptFactory - Function that creates and returns an Inquirer prompt promise.
 * @param {Object} [options]
 * @param {boolean} [options.allowBack=true] - Whether Backspace/Escape triggers NAV_BACK.
 * @param {boolean} [options.isTextInput=false] - For text inputs, only empty input triggers back on Backspace.
 * @param {Function} [options.getInputValue] - Getter returning current input text buffer.
 */
export async function withNav(promptFactory, options = {}) {
  const { allowBack = true, isTextInput = false, getInputValue } = options;

  if (!allowBack || !process.stdin.isTTY) {
    try {
      const res = await promptFactory();
      return res;
    } catch (e) {
      if (e?.name === 'CancelPromptError') return NAV_BACK;
      throw e;
    }
  }

  let promptPromise = null;
  let triggeredBack = false;

  const onKeypress = (ch, key) => {
    if (!key) return;
    const isBackKey = key.name === 'backspace' || ch === '\x08' || ch === '\x7f';
    const isEscKey = key.name === 'escape';

    if (isEscKey) {
      triggeredBack = true;
      promptPromise?.cancel?.();
      return;
    }

    if (isBackKey) {
      if (isTextInput && typeof getInputValue === 'function') {
        const currentVal = getInputValue();
        if (currentVal && currentVal.length > 0) {
          // User is deleting characters in text input
          return;
        }
      }
      triggeredBack = true;
      promptPromise?.cancel?.();
    }
  };

  process.stdin.on('keypress', onKeypress);

  try {
    promptPromise = promptFactory();
    const result = await promptPromise;
    return result;
  } catch (err) {
    if (triggeredBack || err?.name === 'CancelPromptError') {
      return NAV_BACK;
    }
    throw err;
  } finally {
    process.stdin.removeListener('keypress', onKeypress);
  }
}
