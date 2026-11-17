const GiB = 1024 ** 3;
const fmtBytes = (b) => (b ? (b / GiB).toFixed(2) + ' GB' : '-');
const fmtExpires = (exp) => {
  if (!exp) return '-';
  try {
    const d = new Date(exp);
    return isNaN(d.getTime()) ? String(exp) : (d.toLocaleTimeString?.() || String(exp));
  } catch {
    return String(exp);
  }
};

export function setupEngineDashboard({ engineId, container, api, t, esc, onTuneModel, autoRefresh = false }) {
  let status = null;
  let activeModels = [];
  let installedModels = [];
  let storagePath = '';
  let canEdit = true;
  let filter = '';
  let busy = false;
  let pollTimer = null;
  let loadNotice = '';

  const refresh = async () => {
    if (busy) return;
    busy = true;
    try {
      const [statusRes, psRes, modelsRes, storageRes] = await Promise.all([
        api(`/api/engines/${engineId}/status`),
        api(`/api/engines/${engineId}/ps`),
        api(`/api/engines/${engineId}/models`),
        api(`/api/engines/${engineId}/storage`)
      ]);
      status = statusRes;
      activeModels = psRes.models || [];
      installedModels = modelsRes.models || [];
      storagePath = storageRes.modelsDir || storageRes.path || '';
      canEdit = storageRes.canEdit ?? true;
      render();
    } catch (e) {
      console.error(e);
    } finally {
      busy = false;
    }
  };

  const startPolling = () => {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (!busy) refresh();
    }, 5000);
  };

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const render = () => {
    container.innerHTML = '';
    const engineName = status?.name || (engineId === 'ollama' ? 'Ollama' : 'LM Studio');
    const isRunning = status?.running ?? false;
    const version = status?.version ? `v${status.version}` : '';

    const header = document.createElement('header');
    header.innerHTML = `
      <div class="row wrap" style="justify-content:space-between;align-items:center;width:100%">
        <div style="display:flex;align-items:center;gap:10px">
          <h2>${esc(engineName)}</h2>
          <span class="tag ${isRunning ? 'prio' : ''}">${esc(t(isRunning ? 'web.statusRunning' : 'web.statusStopped'))}</span>
          ${version ? `<span class="muted small">${esc(version)}</span>` : ''}
          ${status?.apiUrl ? `<span class="muted small mono">(${esc(status.apiUrl)})</span>` : ''}
        </div>
        <button class="btn secondary" id="refresh-btn" type="button">${esc(t('web.refresh'))}</button>
      </div>
    `;
    container.appendChild(header);

    // Active Models Panel
    const activeSection = document.createElement('section');
    activeSection.className = 'panel-section';
    activeSection.innerHTML = `<h3 style="margin-top:16px">${esc(t('web.activeModelsTitle'))}</h3>`;

    if (activeModels.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted small';
      empty.textContent = t('web.noActiveModels');
      activeSection.appendChild(empty);
    } else {
      const tableWrap = document.createElement('div');
      tableWrap.className = 'table-wrap';
      const table = document.createElement('table');
      table.innerHTML = `
        <thead>
          <tr>
            <th>${esc(t('web.colModel'))}</th>
            <th>${esc(t('web.colVram'))}</th>
            <th>${esc(t('web.details'))}</th>
            <th>${esc(t('web.colExpires'))}</th>
            <th>${esc(t('web.colActions'))}</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody');
      activeModels.forEach((m) => {
        const tr = document.createElement('tr');
        const vramText = m.sizeVram ? fmtBytes(m.sizeVram) : (m.sizeBytes ? fmtBytes(m.sizeBytes) : 'Active');
        const quantText = m.details?.quantization_level || m.quant || '';
        const sizeText = m.details?.parameter_size || '';
        const detailsText = [sizeText, quantText].filter(Boolean).join(' · ') || '-';
        tr.innerHTML = `
          <td><b>${esc(m.name || m.model)}</b></td>
          <td>${esc(vramText)}</td>
          <td class="muted small">${esc(detailsText)}</td>
          <td class="muted small">${esc(fmtExpires(m.expiresAt))}</td>
          <td>
            <button class="btn secondary sm" data-action="unload" data-name="${esc(m.name || m.model)}" type="button">${esc(t('web.unloadModel'))}</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
      tableWrap.appendChild(table);
      activeSection.appendChild(tableWrap);
    }
    container.appendChild(activeSection);

    // Installed Models Panel
    const installedSection = document.createElement('section');
    installedSection.className = 'panel-section';
    installedSection.innerHTML = `
      <div class="row wrap" style="justify-content:space-between;align-items:center;margin-top:20px">
        <h3>${esc(t('web.installedModelsTitle'))}</h3>
        <input type="text" id="model-filter" class="form-control" style="max-width:240px;padding:4px 8px;font-size:0.85rem" placeholder="${esc(t('web.filterModels'))}" value="${esc(filter)}">
      </div>
      <div id="installed-notice" style="margin-top:8px">${loadNotice ? `<p class="notice info">${esc(loadNotice)}</p>` : ''}</div>
    `;

    const filterInput = installedSection.querySelector('#model-filter');
    filterInput.addEventListener('input', (e) => {
      filter = e.target.value.toLowerCase();
      renderInstalledRows();
    });

    const installedTableWrap = document.createElement('div');
    installedTableWrap.className = 'table-wrap';
    const installedTable = document.createElement('table');
    installedTable.innerHTML = `
      <thead>
        <tr>
          <th>${esc(t('web.colModel'))}</th>
          <th>${esc(t('web.colSize'))}</th>
          <th>${esc(t('web.quant'))}</th>
          <th>${esc(t('web.colActions'))}</th>
        </tr>
      </thead>
      <tbody id="installed-tbody"></tbody>
    `;
    installedTableWrap.appendChild(installedTable);
    installedSection.appendChild(installedTableWrap);
    container.appendChild(installedSection);

    const installedTbody = installedTable.querySelector('#installed-tbody');
    const renderInstalledRows = () => {
      const filtered = installedModels.filter((m) => (m.name || m.key || '').toLowerCase().includes(filter));
      installedTbody.innerHTML = '';
      if (filtered.length === 0) {
        installedTbody.innerHTML = `<tr><td colspan="4" class="muted small">${esc(t('web.noInstalledModels'))}</td></tr>`;
        return;
      }
      filtered.forEach((m) => {
        const modelKey = m.key || m.name;
        const tr = document.createElement('tr');
        const presetBadge = m.hasPreset ? ` <span class="tag prio">${esc(t('web.presetReady'))}</span>` : '';
        tr.innerHTML = `
          <td><b>${esc(m.name || modelKey)}</b>${presetBadge}</td>
          <td class="num muted small">${esc(fmtBytes(m.sizeBytes))}</td>
          <td class="muted small">${esc(m.quant || '-')}</td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn primary sm" data-action="load" data-name="${esc(modelKey)}" type="button">${esc(t('web.loadModel'))}</button>
              <button class="btn secondary sm" data-action="tune" data-name="${esc(modelKey)}" type="button">${esc(t('web.tuneInTuner'))}</button>
              <button class="btn secondary sm" data-action="delete" data-name="${esc(modelKey)}" type="button">${esc(t('web.deleteModel'))}</button>
            </div>
          </td>
        `;
        installedTbody.appendChild(tr);
      });
    };
    renderInstalledRows();

    // Storage Path Panel
    const storageSection = document.createElement('section');
    storageSection.className = 'panel-section';
    storageSection.innerHTML = `
      <h3 style="margin-top:20px">${esc(t('web.storagePathTitle'))}</h3>
      <form id="storage-form" class="row wrap" style="gap:8px;align-items:center;margin-top:8px">
        <input type="text" name="path" style="flex-grow:1;min-width:240px;padding:6px 10px;font-family:monospace" value="${esc(storagePath)}" ${canEdit ? '' : 'disabled'} required>
        <button class="btn secondary" type="submit" ${canEdit ? '' : 'disabled'}>${esc(t('web.saveStoragePath'))}</button>
      </form>
      <div id="storage-notice" style="margin-top:8px"></div>
    `;
    container.appendChild(storageSection);

    // Event listeners
    header.querySelector('#refresh-btn').addEventListener('click', () => refresh());

    activeSection.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action="unload"]');
      if (!btn) return;
      const model = btn.dataset.name;
      btn.disabled = true;
      btn.textContent = t('web.unloading');
      try {
        await api(`/api/engines/${engineId}/unload`, { model });
        await refresh();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = t('web.unloadModel');
      }
    });

    installedSection.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const model = btn.dataset.name;

      if (action === 'tune' && onTuneModel) {
        await onTuneModel(engineId, model);
        return;
      }

      if (action === 'load') {
        btn.disabled = true;
        try {
          const res = await api(`/api/engines/${engineId}/load`, { model });
          if (res?.unoptimized) {
            loadNotice = t('web.unoptimizedNotice');
          } else {
            loadNotice = '';
          }
          await refresh();
        } catch (err) {
          alert(err.message);
        } finally {
          btn.disabled = false;
        }
        return;
      }

      if (action === 'delete') {
        if (!confirm(t('web.deleteModelConfirm', { model }))) return;
        btn.disabled = true;
        try {
          await api(`/api/engines/${engineId}/models`, { model }, 'DELETE');
          await refresh();
        } catch (err) {
          alert(err.message);
        } finally {
          btn.disabled = false;
        }
      }
    });

    const storageForm = storageSection.querySelector('#storage-form');
    storageForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = storageForm.querySelector('input[name="path"]');
      const noticeDiv = storageSection.querySelector('#storage-notice');
      noticeDiv.innerHTML = '';
      try {
        const res = await api(`/api/engines/${engineId}/storage`, { path: input.value });
        if (res?.requiresRestart) {
          const p = document.createElement('p');
          p.className = 'notice';
          p.textContent = t('web.pathUpdatedRestartNotice');
          noticeDiv.appendChild(p);
        }
        if (res?.manualCommand) {
          const pre = document.createElement('pre');
          pre.className = 'log';
          pre.textContent = res.manualCommand;
          noticeDiv.appendChild(pre);
        }
      } catch (err) {
        noticeDiv.innerHTML = `<p class="notice warn">${esc(err.message)}</p>`;
      }
    });
  };

  if (autoRefresh) {
    refresh();
  }

  return { refresh, startPolling, stopPolling };
}
