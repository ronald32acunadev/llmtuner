export function parseCandidateCount(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: true, value: undefined };
  if (!/^[0-9]+$/.test(text)) return { ok: false };
  const value = Number(text);
  // when value is a safe integer above 0 return { ok: true, value }, otherwise { ok: false }
  if (Number.isSafeInteger(value) && value > 0) {
    return { ok: true, value };
  } else {
    return { ok: false };
  }
}

export function buildLoadRequest({ engine, model, ctx, profile, force, candidatesRaw, dryRun }) {
  const count = parseCandidateCount(candidatesRaw);
  if (!count.ok) return { ok: false, errorKey: 'errors.invalidCandidateCount' };
  const request = { engine, model, ctx, profile, force, dryRun, confirm: !dryRun };
  if (count.value !== undefined) request.candidates = count.value;
  return { ok: true, request };
}

const OUTCOME_VIEWS = {
  preview: { pill: 'warn', statusKey: 'web.loadPreviewStatus', noticeKey: 'web.loadPreviewNotice' },
  declined: { pill: 'warn', statusKey: 'web.loadDeclinedStatus', noticeKey: 'web.loadDeclinedNotice' },
};

export function outcomeView({ outcome } = {}) {
  return OUTCOME_VIEWS[outcome] ?? { pill: 'ok', statusKey: null, noticeKey: null };
}

export function previewLines(preview, t) {
  if (preview.files) {
    // return the files, plus t('cli.lmsRestart') at the end when preview.restartsApp
    const lines = [...preview.files];
    if (preview.restartsApp) {
      lines.push(t('cli.lmsRestart'));
    }
    return lines;
  }
  const env = Object.entries(preview.env ?? {}).map(([key, value]) => `${key}=${value}`).join(' ');
  return [t('cli.ollamaNewModel', { name: preview.tunedModel }), t('cli.ollamaServer', { env })];
}
