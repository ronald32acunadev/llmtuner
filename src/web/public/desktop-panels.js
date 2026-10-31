import { previewLines } from './load-flow.js';
import { presetFilters, filterPresets, presetSummary } from './presets-view.js';

export function createConfirmationPanel({ $, esc, t, api }) {
  const panel = $('#load-confirm');
  const hide = () => { panel.hidden = true; };

  const show = (jobId, event, onError) => {
    $('#load-confirm-list').innerHTML = previewLines(event.preview, t).map((line) => `<li>${esc(line)}</li>`).join('');
    panel.hidden = false;
    const answer = async (accepted) => {
      hide();
      try {
        await api(`/api/jobs/${jobId}/confirm`, { confirmationId: event.confirmationId, accepted });
      } catch (error) {
        onError(error.message);
      }
    };
    $('#load-confirm-accept').onclick = () => answer(true);
    $('#load-confirm-decline').onclick = () => answer(false);
  };

  return { show, hide };
}

export function setupModelDownload({ $, t, api, follow, errText, getEngine, onDownloaded }) {
  const form = $('#model-download');
  const log = $('#model-download-log');
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = $('#model-download-btn');
    button.disabled = true;
    log.textContent = '';
    try {
      const engine = getEngine();
      const { jobId } = await api('/api/models/download', { engine: engine.id, name: $('#model-download-name').value });
      const done = await follow(jobId, (e) => {
        if (e.type === 'log') log.textContent += e.line + '\n';
      });
      if (done.ok) await onDownloaded(engine);
      else log.textContent += errText(done);
    } catch (error) {
      log.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}

export function setupPresetInventory({ $, esc, t, api }) {
  let presets = [];
  const engineSel = $('#preset-filter-engine');
  const modelSel = $('#preset-filter-model');
  const list = $('#preset-inventory');

  const options = (select, values) => {
    const current = select.value;
    select.innerHTML = `<option value="">${esc(t('web.presetFilterAll'))}</option>` + values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    select.value = values.includes(current) ? current : '';
  };

  const render = () => {
    const shown = filterPresets(presets, { engine: engineSel.value, model: modelSel.value });
    if (!shown.length) {
      list.innerHTML = `<li class="muted small">${esc(t('cli.noPresets'))}</li>`;
      return;
    }
    list.innerHTML = shown.map((p) => {
      const s = presetSummary(p, t);
      return `<li class="small"><b>${esc(s.model)}</b> · ${esc(s.engine)} · ${esc(s.context)}${s.profile ? ` · ${esc(s.profile)}` : ''}<br><span class="muted">KV ${esc(s.kv)} · ${esc(s.offload)} · ${esc(s.tps)} · ${esc(s.date)}</span></li>`;
    }).join('');
  };

  engineSel.onchange = render;
  modelSel.onchange = render;

  return async function refresh() {
    try {
      ({ presets } = await api('/api/presets'));
      const filters = presetFilters(presets);
      options(engineSel, filters.engines);
      options(modelSel, filters.models);
      render();
    } catch (error) {
      list.innerHTML = `<li class="err small">${esc(error.message)}</li>`;
    }
  };
}
