import { format } from '/i18n/core.js';

const $ = (s) => document.querySelector(s);
const GiB = 1024 ** 3;
const gb = (b) => (b / GiB).toFixed(1) + ' GB';
const k = (n) => (n >= 1024 ? `${Math.round(n / 1024)}K` : String(n));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Messages for the chosen language (English fills any gap), loaded in boot().
let messages = {};
const t = (key, params) => format(messages[key] ?? key, params);
const errText = (o, fallbackKey = 'bench.loadFailed') => (o?.code ? t(o.code, o.params) : o?.error || t(fallbackKey));
const benchErr = (b) => (b.errorCode ? t(b.errorCode, b.errorParams) : b.error);

const state = { hw: null, engines: [], engine: null, presets: [], meta: null, loadedModel: null, chatMessages: [], chatBusy: false };

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json();
  if (!res.ok) throw new Error(data.code ? t(data.code, data.params) : (data.error || res.statusText));
  return data;
}

function follow(jobId, onEvent) {
  return new Promise((resolve) => {
    const es = new EventSource(`/api/jobs/${jobId}/events`);
    es.onmessage = (m) => {
      const e = JSON.parse(m.data);
      onEvent(e);
      if (e.type === 'finished') { es.close(); resolve(e); }
    };
    es.onerror = () => { es.close(); resolve({ type: 'finished', ok: false, code: 'web.connectionLost' }); };
  });
}

function step(name) {
  const order = ['engine', 'model', 'load'];
  const i = order.indexOf(name);
  document.querySelectorAll('#steps li').forEach((li) => {
    const j = order.indexOf(li.dataset.step);
    li.classList.toggle('done', j < i);
    li.classList.toggle('active', j === i);
  });
}

function describe(c) {
  const where = c.fullOffload ? t('candidate.allGpu') : t('candidate.layersGpu', { gpu: c.gpuLayers, total: c.totalLayers });
  return `KV ${c.kvType} · ${where}${c.cpuMoeLayers ? t('candidate.expertsRam', { layers: c.cpuMoeLayers }) : ''}${c.probe ? t('candidate.probe') : ''}`;
}

// ---------- Language ----------
function applyStatic() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
}


function applyTheme(theme) {
  if (theme === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

function setupDrawer() {
  const openBtn = $('#settings-open');
  const closeBtn = $('#settings-close');
  const drawer = $('#settings-drawer');
  const backdrop = $('#settings-backdrop');
  if (!openBtn || !closeBtn || !drawer || !backdrop) return;

  let closing = false;

  function open() {
    backdrop.hidden = false;
    drawer.hidden = false;
    void drawer.offsetWidth;
    backdrop.classList.add('open');
    drawer.classList.add('open');
    openBtn.setAttribute('aria-expanded', 'true');
    closeBtn.focus();
  }

  function close() {
    if (drawer.hidden || closing) return;
    closing = true;
    backdrop.classList.remove('open');
    drawer.classList.remove('open');
    openBtn.setAttribute('aria-expanded', 'false');

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      backdrop.hidden = true;
      drawer.hidden = true;
      closing = false;
      openBtn.focus();
    };

    drawer.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 300);
  }

  openBtn.onclick = open;
  closeBtn.onclick = close;
  backdrop.onclick = close;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden && !closing) {
      close();
    }
  });

  if (location.hash === '#settings') open();
  window.addEventListener('hashchange', () => {
    if (location.hash === '#settings') open();
  });
}

// Changing the language reloads the page, so it is locked while a job runs.
function setBusy(busy) {
  $('#lang').disabled = busy;
  $('#theme').disabled = busy;
}

async function boot() {
  const s = await api('/api/settings');
  applyTheme(s.theme);
  ({ messages } = await api(`/api/i18n/${s.lang}`));
  document.documentElement.lang = s.lang;
  applyStatic();
  setupDrawer();
  $('#lang').value = s.lang;
  $('#lang').onchange = async () => {
    const prev = s.lang;
    setBusy(true);
    try {
      await api('/api/settings', { lang: $('#lang').value });
      location.reload();
    } catch (err) {
      $('#lang').value = prev;
      setBusy(false);
      alert(t('common.error', { message: err.message }));
    }
  };
  $('#theme').value = s.theme;
  $('#theme').onchange = async () => {
    const prev = s.theme;
    const next = $('#theme').value;
    applyTheme(next);
    try {
      await api('/api/settings', { theme: next });
      s.theme = next;
    } catch (err) {
      $('#theme').value = prev;
      applyTheme(prev);
      alert(t('common.error', { message: err.message }));
    }
  };
  await init();
}

// ---------- Engine ----------
async function init() {
  const s = await api('/api/state');
  state.hw = s.hw;
  state.engines = s.engines;
  setBusy(s.busy);
  $('#hw-mini').innerHTML = `<div>${esc(s.hw.cpu.brand)}</div><div>${gb(s.hw.ram.totalBytes)} RAM</div>` +
    (s.hw.gpus.length ? s.hw.gpus.map((g) => `<div>GPU${g.index} ${esc(g.name.replace(/^NVIDIA GeForce /, ''))} · ${gb(g.totalBytes)}${g.pcieGen ? ` · PCIe ${g.pcieGen}.0 x${g.pcieWidth}` : ''}</div>`).join('') : `<div>${esc(t('web.noGpu'))}</div>`);
  $('#engine-reason').textContent = t(s.reasonCode, s.reasonParams);
  const box = $('#engines');
  box.innerHTML = '';
  for (const e of s.engines) {
    const d = e.detection;
    const btn = document.createElement('button');
    btn.className = 'engine';
    btn.type = 'button';
    btn.dataset.id = e.id;
    btn.innerHTML = `<b>${esc(e.name)}${e.id === s.recommended ? ` <span class="tag prio">${esc(t('web.recommended'))}</span>` : ''}</b>
      <small>${d.installed ? `${esc(t('web.installed'))}${d.version ? ' · v' + esc(d.version) : ''}` : esc(t('web.notInstalled'))}</small>`;
    btn.onclick = () => chooseEngine(e);
    box.appendChild(btn);
  }
}

async function chooseEngine(e) {
  state.engine = e;
  document.querySelectorAll('.engine').forEach((b) => b.classList.toggle('selected', b.dataset.id === e.id));
  if (!e.detection.installed) return showInstall(e);
  $('#install').hidden = true;
  $('#sec-model').hidden = false;
  step('model');
  $('#model').innerHTML = `<option>${esc(t('web.readingModels'))}</option>`;
  const { models } = await api(`/api/models?engine=${e.id}`);
  $('#model').innerHTML = models.length
    ? models.map((m) => `<option value="${esc(m.key)}">${esc(m.name)} · ${gb(m.sizeBytes)}${m.quant ? ' · ' + esc(m.quant) : ''}</option>`).join('')
    : `<option value="">${esc(t('web.noModels'))}</option>`;
  if (models.length) onModelChange();
}

async function showInstall(e) {
  $('#install').hidden = false;
  $('#sec-model').hidden = true;
  const { plans } = await api(`/api/install-plans?engine=${e.id}`);
  $('#install-plan').innerHTML = plans.map((p) => `<option value="${p.id}">${esc(t(p.labelCode))}</option>`).join('');
  $('#install-btn').onclick = async () => {
    const log = $('#install-log');
    log.hidden = false;
    log.textContent = '';
    setBusy(true);
    try {
      const r = await api('/api/install', { engine: e.id, planId: $('#install-plan').value });
      if (r.manualCommand) {
        log.textContent = t('web.needsAdmin', { command: r.manualCommand });
        return;
      }
      const done = await follow(r.jobId, (ev) => { if (ev.line) { log.textContent += ev.line + '\n'; log.scrollTop = log.scrollHeight; } });
      log.textContent += done.ok
        ? `\n${done.manual ? t('web.downloadOpened') : t('web.installDone')}`
        : `\n${t('common.error', { message: errText(done, 'web.installerFailed') })}`;
      if (done.ok && !done.manual) init().then(() => chooseEngine(state.engines.find((x) => x.id === e.id)));
    } catch (err) {
      log.textContent += `\n${t('common.error', { message: err.message })}`;
    } finally {
      setBusy(false);
    }
  };
}

// ---------- Model + context ----------
async function onModelChange() {
  const model = $('#model').value;
  if (!model) return;
  $('#load-btn').disabled = true;
  $('#model-meta').textContent = t('web.readingModel');
  const [{ presets }, plan] = await Promise.all([
    api(`/api/presets?engine=${state.engine.id}&model=${encodeURIComponent(model)}`),
    api('/api/plan', { engine: state.engine.id, model, ctx: Number($('#ctx').value) }).catch((err) => ({ error: err.message })),
  ]);
  state.presets = presets;
  if (plan.error) { $('#model-meta').textContent = t('web.modelReadFailed', { error: plan.error }); return; }
  state.meta = plan.meta;
  const m = plan.meta;
  $('#ctx').max = m.trainContext || 131072;
  $('#model-meta').textContent = [
    m.arch,
    t('web.layers', { n: m.nLayers }) + (m.isMoE ? ` · MoE ${m.nExpertsUsed}/${m.nExperts}` : ''),
    t('web.trainedUpTo', { ctx: m.trainContext ? k(m.trainContext) : '?' }),
    t('web.maxAllGpu', { list: Object.entries(plan.maxContext).map(([kv, v]) => `${v ? k(v) : '—'} (KV ${kv})`).join(', ') }),
  ].join(' · ');
  renderChips(plan.maxContext);
  renderGpus(plan.candidates[0]);
  updatePresetPill();
  $('#load-btn').disabled = false;
}

function renderChips(maxContext) {
  const limit = state.meta.trainContext || 131072;
  const q8 = maxContext.q8_0 || 0;
  const values = [...new Set([4096, 8192, 16384, 32768, 65536, 131072, ...state.presets.map((p) => p.ctx)])].filter((v) => v <= limit).sort((a, b) => a - b);
  $('#ctx-chips').innerHTML = values.map((v) => {
    const p = state.presets.find((x) => x.ctx === v);
    const cls = p ? 'chip saved' : v <= q8 ? 'chip fits' : 'chip';
    const title = p ? t('web.presetSavedTitle', { tps: p.shortTps }) : v <= q8 ? t('web.fitsGpu') : t('web.mayNeedKv');
    return `<button type="button" class="${cls}" data-v="${v}" title="${esc(title)}">${k(v)}${p ? ' ✓' : ''}</button>`;
  }).join('');
  $('#ctx-chips').querySelectorAll('button').forEach((b) => { b.onclick = () => { $('#ctx').value = b.dataset.v; updatePresetPill(); }; });
}

function updatePresetPill() {
  const ctx = Number($('#ctx').value);
  const p = state.presets.find((x) => x.ctx === ctx);
  const pill = $('#preset-pill');
  pill.hidden = false;
  pill.className = p ? 'pill ok' : 'pill warn';
  pill.textContent = p ? t('web.presetPillSaved', { tps: p.shortTps }) : t('web.presetPillNone');
  document.querySelectorAll('#ctx-chips .chip').forEach((b) => b.classList.toggle('current', Number(b.dataset.v) === ctx));
}

function renderGpus(candidate) {
  const box = $('#gpus');
  if (!state.hw.gpus.length || !candidate) { box.innerHTML = ''; return; }
  box.innerHTML = state.hw.gpus.map((g) => {
    const lp = candidate.layersPerGpu?.find((l) => l.index === g.index);
    const usedPct = (g.usedBytes / g.totalBytes) * 100;
    const planPct = lp ? Math.min(100 - usedPct, (lp.bytes / g.totalBytes) * 100) : 0;
    return `<div class="gpu">
      <div class="gpu-head"><span>GPU ${g.index}</span><span class="muted">${lp ? esc(t('web.gpuLayers', { layers: lp.layers, used: gb(lp.bytes), free: gb(g.freeBytes) })) : ''}</span></div>
      <div class="meter" role="img" aria-label="${esc(t('web.vramAria', { index: g.index }))}"><i class="used" style="width:${usedPct}%"></i><i class="model" style="width:${planPct}%"></i></div>
    </div>`;
  }).join('') + `<div class="legend"><span style="--c:var(--cpu)">${esc(t('web.legendOther'))}</span><span style="--c:var(--gpu)">${esc(t('web.legendModel'))}</span></div>`;
}

$('#model').onchange = onModelChange;
let timer;
$('#ctx').oninput = () => { updatePresetPill(); clearTimeout(timer); timer = setTimeout(async () => {
  const plan = await api('/api/plan', { engine: state.engine.id, model: $('#model').value, ctx: Number($('#ctx').value) }).catch(() => null);
  if (plan) renderGpus(plan.candidates[0]);
}, 400); };

// ---------- Load ----------
$('#load-btn').onclick = async () => {
  const model = $('#model').value;
  const ctx = Number($('#ctx').value);
  $('#load-btn').disabled = true;
  setBusy(true);
  $('#sec-load').hidden = false;
  step('load');
  $('#load-title').textContent = t('web.loadingTitle', { model, ctx: k(ctx) });
  const status = $('#load-status');
  status.className = 'pill';
  status.textContent = t('web.inProgress');
  $('#bench').hidden = true;
  $('#chat-box').hidden = true;
  $('#chat-messages').innerHTML = '';
  state.loadedModel = null;
  state.chatMessages = [];
  $('#load-result').innerHTML = '';
  const log = $('#load-log');
  log.textContent = '';
  const addLog = (s) => { log.textContent += s + '\n'; log.scrollTop = log.scrollHeight; };
  const tbody = $('#results tbody');
  tbody.innerHTML = '';
  const rows = [];

  try {
    const { jobId } = await api('/api/load', { engine: state.engine.id, model, ctx, force: $('#force').checked });
    const done = await follow(jobId, (e) => {
      if (e.type === 'status') addLog(t(e.code, e.params));
      if (e.type === 'preset-hit') addLog(t('web.presetHit', { date: e.preset.createdAt.slice(0, 10), config: describe(e.preset.candidate) }));
      if (e.type === 'plan') {
        $('#bench').hidden = false;
        e.candidates.forEach((c, i) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${esc(describe(c))}</td><td>${c.gpuLayers}/${c.totalLayers}</td><td class="num">${c.predicted.tpsShort}</td><td class="num">…</td><td class="num">…</td><td class="num">…</td><td>${esc(t('web.pending'))}</td>`;
          tbody.appendChild(tr);
          rows[i] = tr;
        });
      }
      if (e.type === 'candidate-start') addLog(`[${e.index + 1}/${e.total}] ${describe(e.candidate)}`);
      if (e.type === 'bench-progress' && e.phase === 'deep') addLog(`   ${t('common.longPrompt', { tokens: e.promptTokens })}`);
      if (e.type === 'candidate-done') {
        const b = e.bench, tr = rows[e.index];
        if (!tr) return;
        if (!b.ok) { tr.className = 'fail'; tr.cells[3].textContent = '✗'; tr.cells[6].innerHTML = `<span class="err">${esc(benchErr(b))}</span>`; return; }
        tr.cells[3].textContent = b.short.genTps;
        tr.cells[4].textContent = b.deep ? `${b.deep.genTps} @${k(b.deep.promptTokens)}` : '—';
        tr.cells[5].textContent = b.cpu?.avg != null ? `${b.cpu.avg}%` : '—';
        tr.cells[6].textContent = Object.entries(b.vramPeakBytes || {}).map(([i, v]) => `GPU${i} ${gb(v)}`).join(' · ') || t('common.na');
      }
      if (e.type === 'preset-saved') addLog(t('common.presetSaved', { file: e.file }));
    });
    if (!done.ok) {
      const loaded = done.result?.loaded;
      throw new Error(done.code || done.error ? errText(done) : loaded && !loaded.ok ? benchErr(loaded) : t('bench.loadFailed'));
    }
    const r = done.result;
    if (r.report?.best) {
      const idx = r.report.results.findIndex((x) => x.candidate.id === r.report.best.candidate.id);
      rows[idx]?.classList.add('best');
    }
    status.className = 'pill ok';
    status.textContent = r.source === 'preset' ? t('web.fromPreset') : t('web.measuredLoaded');
    let html = '';
    if (r.loaded?.ok) {
      html += `<div class="best"><div><span class="big">${r.loaded.short.genTps}</span> <span class="muted">tokens/s</span></div>
      <div><b>${esc(describe(r.candidate))}</b> · ${esc(t('web.threadsCtx', { threads: r.candidate.threads, ctx: k(r.candidate.ctx) }))}${r.loaded.model ? `<br><span class="muted small">${esc(t('web.usesModel'))} <code>${esc(r.loaded.model)}</code></span>` : ''}</div></div>`;
      state.loadedModel = r.loaded.model || model;
      initChat();
    }
    if (r.applied?.changes?.length) html += `<div class="muted small">${r.applied.changes.map((ch) => esc(t(ch.code, ch.params))).join('<br>')}</div>`;
    if (r.applied?.backups?.length) html += `<div class="muted small">${esc(t('common.backups', { list: r.applied.backups.join(', ') }))}</div>`;
    if (r.applied?.pendingCommands?.length) html += `<div class="notice warn">${esc(t('web.pendingCommands'))}<pre>${esc(r.applied.pendingCommands.join('\n'))}</pre></div>`;
    $('#load-result').innerHTML = html;
    const { presets } = await api(`/api/presets?engine=${state.engine.id}&model=${encodeURIComponent(model)}`);
    state.presets = presets;
    updatePresetPill();
  } catch (err) {
    status.className = 'pill bad';
    status.textContent = t('web.error');
    $('#chat-box').hidden = true;
    $('#load-result').innerHTML = `<div class="notice warn">${esc(err.message)}</div>`;
  } finally {
    $('#load-btn').disabled = false;
    setBusy(false);
  }
};

// ---------- Chat tester ----------
function appendMessage(role, text) {
  const container = $('#chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function initChat() {
  $('#chat-box').hidden = false;
  $('#chat-messages').innerHTML = '';
  state.chatMessages = [];
  const input = $('#chat-input');
  input.value = '';
  input.disabled = false;
  $('#chat-send').disabled = false;
  input.focus();
}

$('#chat-form').onsubmit = async (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text || !state.loadedModel || state.chatBusy) return;

  state.chatBusy = true;
  input.value = '';
  input.disabled = true;
  $('#chat-send').disabled = true;

  appendMessage('user', text);
  state.chatMessages.push({ role: 'user', content: text });

  const loadingDiv = appendMessage('loading', t('web.chatThinking'));

  try {
    const res = await api('/api/chat', {
      engine: state.engine.id,
      model: state.loadedModel,
      messages: state.chatMessages,
    });
    loadingDiv.remove();
    const reply = res.message?.content || '';
    appendMessage('assistant', reply);
    state.chatMessages.push({ role: 'assistant', content: reply });
  } catch (err) {
    loadingDiv.remove();
    appendMessage('error', err.message);
  } finally {
    state.chatBusy = false;
    input.disabled = false;
    $('#chat-send').disabled = false;
    input.focus();
  }
};

boot().catch((err) => { $('#hw-mini').textContent = `Error: ${err.message}`; });

