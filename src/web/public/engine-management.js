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
  let storageNoticeHtml = '';

  let isInitialized = false;
  let isEditingStorage = false;

  let headerStatusTag = null;
  let headerVersion = null;
  let headerApiUrl = null;
  let activeSection = null;
  let installedTbody = null;
  let installedNotice = null;
  let pathInput = null;
  let savePathBtn = null;
  let noticeDiv = null;

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

  const renderInstalledRows = () => {
    if (!installedTbody) return;
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

  const renderActiveSection = () => {
    if (!activeSection) return;
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
  };

  async function renderStorageResult(res, currentPath) {
    if (!noticeDiv) return;
    noticeDiv.innerHTML = '';
    if (res?.restarted) {
      isEditingStorage = false;
      storageNoticeHtml = `<p class="notice">${esc(t('web.storageUpdatedAndRestarted'))}</p>`;
      noticeDiv.innerHTML = storageNoticeHtml;
      await refresh();
      startPolling();
      return;
    }

    if (res?.ok) {
      isEditingStorage = false;
      if (res.requiresRestart) {
        const p = document.createElement('p');
        p.className = 'notice';
        p.textContent = t('web.pathUpdatedRestartNotice');
        noticeDiv.appendChild(p);
      }
      startPolling();
    } else if (res?.requiresPassword) {
      stopPolling();
      const wrap = document.createElement('div');
      wrap.className = 'notice warn';
      wrap.style.marginTop = '8px';
      wrap.innerHTML = `
        <p style="margin-bottom:8px">${esc(t('web.enterSudoPassword'))}</p>
        <form id="sudo-form" class="row wrap" style="gap:8px;align-items:center">
          <input type="password" name="sudoPassword" style="flex-grow:1;max-width:240px;padding:6px 10px;font-family:monospace" placeholder="sudo password" required autocomplete="current-password">
          <button type="submit" class="btn primary">${esc(t('web.confirmSudo'))}</button>
        </form>
      `;
      noticeDiv.appendChild(wrap);

      const sudoForm = wrap.querySelector('#sudo-form');
      sudoForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const passInput = sudoForm.querySelector('input[name="sudoPassword"]');
        const passwordVal = passInput?.value || '';
        if (passInput) passInput.value = '';
        noticeDiv.innerHTML = `<p class="notice">${esc(t('web.readingModels'))}</p>`;
        try {
          const sudoRes = await api(`/api/engines/${engineId}/storage`, { path: currentPath, password: passwordVal });
          await renderStorageResult(sudoRes, currentPath);
        } catch (err) {
          await renderStorageResult({ requiresPassword: true, error: err.message, manualCommand: res.manualCommand }, currentPath);
        }
      });
    } else if (res?.manualCommand) {
      startPolling();
      const p = document.createElement('p');
      p.className = 'notice warn';
      p.textContent = t('web.storagePrivilegedNotice');
      noticeDiv.appendChild(p);

      const pre = document.createElement('pre');
      pre.className = 'log';
      pre.textContent = res.manualCommand;
      noticeDiv.appendChild(pre);
    }

    if (res?.error) {
      const errP = document.createElement('p');
      errP.className = 'notice warn';
      errP.textContent = esc(res.error);
      noticeDiv.appendChild(errP);
    }

    if (res?.warning) {
      const p = document.createElement('p');
      p.className = 'notice warn';
      p.textContent = t(res.warning.replace(/^cli\./, 'web.'), { path: res.path || currentPath });
      noticeDiv.appendChild(p);
    }
  }

  const render = () => {
    const engineName = status?.name || (engineId === 'ollama' ? 'Ollama' : 'LM Studio');
    const isRunning = status?.running ?? false;
    const version = status?.version ? `v${status.version}` : '';

    if (!isInitialized) {
      container.innerHTML = '';

      const header = document.createElement('header');
      header.innerHTML = `
        <div class="row wrap" style="justify-content:space-between;align-items:center;width:100%">
          <div style="display:flex;align-items:center;gap:10px">
            <h2>${esc(engineName)}</h2>
            <span id="engine-status-tag" class="tag ${isRunning ? 'prio' : ''}">${esc(t(isRunning ? 'web.statusRunning' : 'web.statusStopped'))}</span>
            <span id="engine-version" class="muted small">${esc(version)}</span>
            <span id="engine-api-url" class="muted small mono">${status?.apiUrl ? `(${esc(status.apiUrl)})` : ''}</span>
          </div>
          <button class="btn secondary" id="refresh-btn" type="button">${esc(t('web.refresh'))}</button>
        </div>
      `;
      container.appendChild(header);

      headerStatusTag = header.querySelector('#engine-status-tag');
      headerVersion = header.querySelector('#engine-version');
      headerApiUrl = header.querySelector('#engine-api-url');
      header.querySelector('#refresh-btn').addEventListener('click', () => refresh());

      // Active Models Panel
      activeSection = document.createElement('section');
      activeSection.className = 'panel-section';
      container.appendChild(activeSection);
      renderActiveSection();

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

      installedTbody = installedTable.querySelector('#installed-tbody');
      installedNotice = installedSection.querySelector('#installed-notice');
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
        <div id="storage-notice" style="margin-top:8px">${storageNoticeHtml}</div>
      `;
      container.appendChild(storageSection);

      pathInput = storageSection.querySelector('input[name="path"]');
      savePathBtn = storageSection.querySelector('button[type="submit"]');
      noticeDiv = storageSection.querySelector('#storage-notice');

      pathInput.addEventListener('focus', () => { isEditingStorage = true; });
      pathInput.addEventListener('input', () => { isEditingStorage = true; });
      pathInput.addEventListener('blur', () => {
        if (pathInput.value === storagePath) {
          isEditingStorage = false;
        }
      });

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

      storageSection.querySelector('#storage-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = storageSection.querySelector('input[name="path"]');
        isEditingStorage = true;
        stopPolling();
        noticeDiv.innerHTML = '';
        try {
          const res = await api(`/api/engines/${engineId}/storage`, { path: input.value });
          await renderStorageResult(res, input.value);
        } catch (err) {
          noticeDiv.innerHTML = `<p class="notice warn">${esc(err.message)}</p>`;
          startPolling();
        }
      });

      isInitialized = true;
      return;
    }

    // In-place DOM update without destroying the container
    if (headerStatusTag) {
      headerStatusTag.className = `tag ${isRunning ? 'prio' : ''}`;
      headerStatusTag.textContent = t(isRunning ? 'web.statusRunning' : 'web.statusStopped');
    }
    if (headerVersion) {
      headerVersion.textContent = version;
    }
    if (headerApiUrl) {
      headerApiUrl.textContent = status?.apiUrl ? `(${status.apiUrl})` : '';
    }

    renderActiveSection();

    if (installedNotice) {
      installedNotice.innerHTML = loadNotice ? `<p class="notice info">${esc(loadNotice)}</p>` : '';
    }
    renderInstalledRows();

    // Preserve storage section while user is typing or if sudo form is open
    const hasSudoPrompt = noticeDiv?.querySelector('#sudo-form');
    if (!isEditingStorage && !hasSudoPrompt) {
      if (pathInput && pathInput !== document.activeElement) {
        pathInput.value = storagePath;
        pathInput.disabled = !canEdit;
      }
      if (savePathBtn) {
        savePathBtn.disabled = !canEdit;
      }
      if (noticeDiv && storageNoticeHtml) {
        noticeDiv.innerHTML = storageNoticeHtml;
      }
    }
  };

  if (autoRefresh) {
    refresh();
  }

  return { refresh, startPolling, stopPolling };
}
