const $ = (s) => document.querySelector(s);
const GiB = 1024 ** 3;
const gb = (b) => (b / GiB).toFixed(1) + ' GB';
const k = (n) => (n >= 1024 ? `${Math.round(n / 1024)}K` : String(n));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const state = { hw: null, engines: [], engine: null, presets: [], meta: null };

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
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
    es.onerror = () => { es.close(); resolve({ type: 'finished', ok: false, error: 'Se perdió la conexión con el servidor local' }); };
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
  const where = c.fullOffload ? 'todo en GPU' : `${c.gpuLayers}/${c.totalLayers} capas en GPU`;
  return `KV ${c.kvType} · ${where}${c.cpuMoeLayers ? ` · expertos de ${c.cpuMoeLayers} capas en RAM` : ''}${c.probe ? ' · optimista' : ''}`;
}

// ---------- Engine ----------
async function init() {
  const s = await api('/api/state');
  state.hw = s.hw;
  state.engines = s.engines;
  $('#hw-mini').innerHTML = `<div>${esc(s.hw.cpu.brand)}</div><div>${gb(s.hw.ram.totalBytes)} RAM</div>` +
    (s.hw.gpus.length ? s.hw.gpus.map((g) => `<div>GPU${g.index} ${esc(g.name.replace(/^NVIDIA GeForce /, ''))} · ${gb(g.totalBytes)}${g.pcieGen ? ` · PCIe ${g.pcieGen}.0 x${g.pcieWidth}` : ''}</div>`).join('') : '<div>Sin GPU compatible (solo CPU)</div>');
  $('#engine-reason').textContent = s.reason;
  const box = $('#engines');
  box.innerHTML = '';
  for (const e of s.engines) {
    const d = e.detection;
    const btn = document.createElement('button');
    btn.className = 'engine';
    btn.type = 'button';
    btn.dataset.id = e.id;
    btn.innerHTML = `<b>${esc(e.name)}${e.id === s.recommended ? ' <span class="tag prio">recomendado</span>' : ''}</b>
      <small>${d.installed ? `Instalado${d.version ? ' · v' + esc(d.version) : ''}` : 'No instalado: se instalará al elegirlo'}</small>`;
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
  $('#model').innerHTML = '<option>Leyendo modelos…</option>';
  const { models } = await api(`/api/models?engine=${e.id}`);
  $('#model').innerHTML = models.length
    ? models.map((m) => `<option value="${esc(m.key)}">${esc(m.name)} · ${gb(m.sizeBytes)}${m.quant ? ' · ' + esc(m.quant) : ''}</option>`).join('')
    : '<option value="">No hay modelos descargados</option>';
  if (models.length) onModelChange();
}

async function showInstall(e) {
  $('#install').hidden = false;
  $('#sec-model').hidden = true;
  const { plans } = await api(`/api/install-plans?engine=${e.id}`);
  $('#install-plan').innerHTML = plans.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
  $('#install-btn').onclick = async () => {
    const log = $('#install-log');
    log.hidden = false;
    log.textContent = '';
    const r = await api('/api/install', { engine: e.id, planId: $('#install-plan').value });
    if (r.manualCommand) {
      log.textContent = `Este instalador pide la contraseña de administrador. Ejecuta en una terminal:\n\n  ${r.manualCommand}\n\nDespués recarga esta página.`;
      return;
    }
    const done = await follow(r.jobId, (ev) => { if (ev.line) { log.textContent += ev.line + '\n'; log.scrollTop = log.scrollHeight; } });
    log.textContent += done.ok ? (done.manual ? '\nSe abrió la descarga. Instala la app y recarga esta página.' : '\nInstalación terminada.') : `\nError: ${done.error || 'el instalador falló'}`;
    if (done.ok && !done.manual) init().then(() => chooseEngine(state.engines.find((x) => x.id === e.id)));
  };
}

// ---------- Model + context ----------
async function onModelChange() {
  const model = $('#model').value;
  if (!model) return;
  $('#load-btn').disabled = true;
  $('#model-meta').textContent = 'Leyendo el modelo…';
  const [{ presets }, plan] = await Promise.all([
    api(`/api/presets?engine=${state.engine.id}&model=${encodeURIComponent(model)}`),
    api('/api/plan', { engine: state.engine.id, model, ctx: Number($('#ctx').value) }).catch((err) => ({ error: err.message })),
  ]);
  state.presets = presets;
  if (plan.error) { $('#model-meta').textContent = `No pude leer el modelo: ${plan.error}`; return; }
  state.meta = plan.meta;
  const m = plan.meta;
  $('#ctx').max = m.trainContext || 131072;
  $('#model-meta').textContent = `${m.arch} · ${m.nLayers} capas${m.isMoE ? ` · MoE ${m.nExpertsUsed}/${m.nExperts}` : ''} · entrenado hasta ${m.trainContext ? k(m.trainContext) : '?'} · máximo todo en GPU: ${Object.entries(plan.maxContext).map(([kv, v]) => `${v ? k(v) : '—'} (KV ${kv})`).join(', ')}`;
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
    const title = p ? `Preset guardado · ${p.shortTps} t/s` : v <= q8 ? 'Cabe entero en GPU' : 'Puede requerir KV comprimido o parte en CPU';
    return `<button type="button" class="${cls}" data-v="${v}" title="${title}">${k(v)}${p ? ' ✓' : ''}</button>`;
  }).join('');
  $('#ctx-chips').querySelectorAll('button').forEach((b) => { b.onclick = () => { $('#ctx').value = b.dataset.v; updatePresetPill(); }; });
}

function updatePresetPill() {
  const ctx = Number($('#ctx').value);
  const p = state.presets.find((x) => x.ctx === ctx);
  const pill = $('#preset-pill');
  pill.hidden = false;
  pill.className = p ? 'pill ok' : 'pill warn';
  pill.textContent = p ? `preset guardado · ${p.shortTps} t/s` : 'sin preset · se medirá';
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
      <div class="gpu-head"><span>GPU ${g.index}</span><span class="muted">${lp ? `${lp.layers} capas · ${gb(lp.bytes)} de ${gb(g.freeBytes)} libres` : ''}</span></div>
      <div class="meter" role="img" aria-label="Uso estimado de VRAM en GPU ${g.index}"><i class="used" style="width:${usedPct}%"></i><i class="model" style="width:${planPct}%"></i></div>
    </div>`;
  }).join('') + '<div class="legend"><span style="--c:var(--cpu)">Otros procesos</span><span style="--c:var(--gpu)">Modelo y contexto (estimado para la mejor opción)</span></div>';
}

$('#model').onchange = onModelChange;
let t;
$('#ctx').oninput = () => { updatePresetPill(); clearTimeout(t); t = setTimeout(async () => {
  const plan = await api('/api/plan', { engine: state.engine.id, model: $('#model').value, ctx: Number($('#ctx').value) }).catch(() => null);
  if (plan) renderGpus(plan.candidates[0]);
}, 400); };

// ---------- Load ----------
$('#load-btn').onclick = async () => {
  const model = $('#model').value;
  const ctx = Number($('#ctx').value);
  $('#load-btn').disabled = true;
  $('#sec-load').hidden = false;
  step('load');
  $('#load-title').textContent = `Cargando ${model} con ${k(ctx)} de contexto`;
  const status = $('#load-status');
  status.className = 'pill';
  status.textContent = 'en curso';
  $('#bench').hidden = true;
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
      if (e.type === 'status') addLog(e.message);
      if (e.type === 'preset-hit') addLog(`Preset encontrado (${e.preset.createdAt.slice(0, 10)}): ${describe(e.preset.candidate)}. Sin mediciones.`);
      if (e.type === 'plan') {
        $('#bench').hidden = false;
        e.candidates.forEach((c, i) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${esc(describe(c))}</td><td>${c.gpuLayers}/${c.totalLayers}</td><td class="num">${c.predicted.tpsShort}</td><td class="num">…</td><td class="num">…</td><td class="num">…</td><td>pendiente</td>`;
          tbody.appendChild(tr);
          rows[i] = tr;
        });
      }
      if (e.type === 'candidate-start') addLog(`[${e.index + 1}/${e.total}] ${describe(e.candidate)}`);
      if (e.type === 'bench-progress' && e.phase === 'deep') addLog(`   prompt largo (~${e.promptTokens} tokens)…`);
      if (e.type === 'candidate-done') {
        const b = e.bench, tr = rows[e.index];
        if (!tr) return;
        if (!b.ok) { tr.className = 'fail'; tr.cells[3].textContent = '✗'; tr.cells[6].innerHTML = `<span class="err">${esc(b.error)}</span>`; return; }
        tr.cells[3].textContent = b.short.genTps;
        tr.cells[4].textContent = b.deep ? `${b.deep.genTps} @${k(b.deep.promptTokens)}` : '—';
        tr.cells[5].textContent = b.cpu?.avg != null ? `${b.cpu.avg}%` : '—';
        tr.cells[6].textContent = Object.entries(b.vramPeakBytes || {}).map(([i, v]) => `GPU${i} ${gb(v)}`).join(' · ') || 'n/d';
      }
      if (e.type === 'preset-saved') addLog(`Preset guardado en ${e.file}`);
    });
    if (!done.ok) throw new Error(done.error || done.result?.loaded?.error || 'No se pudo cargar el modelo');
    const r = done.result;
    if (r.report?.best) {
      const idx = r.report.results.findIndex((x) => x.candidate.id === r.report.best.candidate.id);
      rows[idx]?.classList.add('best');
    }
    status.className = 'pill ok';
    status.textContent = r.source === 'preset' ? 'cargado desde preset' : 'medido y cargado';
    let html = '';
    if (r.loaded?.ok) html += `<div class="best"><div><span class="big">${r.loaded.short.genTps}</span> <span class="muted">tokens/s</span></div>
      <div><b>${esc(describe(r.candidate))}</b> · ${r.candidate.threads} hilos · ${k(r.candidate.ctx)} de contexto${r.loaded.model ? `<br><span class="muted small">Usa el modelo <code>${esc(r.loaded.model)}</code></span>` : ''}</div></div>`;
    if (r.applied?.changes?.length) html += `<div class="muted small">${r.applied.changes.map(esc).join('<br>')}</div>`;
    if (r.applied?.backups?.length) html += `<div class="muted small">Copias de seguridad: ${r.applied.backups.map(esc).join(', ')}</div>`;
    if (r.applied?.pendingCommands?.length) html += `<div class="notice warn">Para terminar, ejecuta en una terminal (pide contraseña de administrador):<pre>${esc(r.applied.pendingCommands.join('\n'))}</pre></div>`;
    $('#load-result').innerHTML = html;
    const { presets } = await api(`/api/presets?engine=${state.engine.id}&model=${encodeURIComponent(model)}`);
    state.presets = presets;
    updatePresetPill();
  } catch (err) {
    status.className = 'pill bad';
    status.textContent = 'error';
    $('#load-result').innerHTML = `<div class="notice warn">${esc(err.message)}</div>`;
  } finally {
    $('#load-btn').disabled = false;
  }
};

init().catch((err) => { $('#hw-mini').textContent = `Error: ${err.message}`; });
