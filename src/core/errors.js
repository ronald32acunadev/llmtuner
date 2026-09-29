import { t } from '../i18n/index.js';

/** A user-facing error: interfaces translate `code`; `message` is English for logs. */
export class TunerError extends Error {
  constructor(code, params = {}) {
    super(t('en', code, params));
    this.name = 'TunerError';
    this.code = code;
    this.params = params;
  }
}

/** Failed benchmark/load result with a translatable code. */
export function benchError(code, params = {}) {
  return { ok: false, errorCode: code, errorParams: params, error: t('en', code, params) };
}
