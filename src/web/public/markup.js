export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const shortGpuName = (name) => name.replace(/^NVIDIA GeForce /, '');

export function hardwareGpuHtml(g, gb) {
  const pcie = g.pcieGen ? ` · PCIe ${esc(g.pcieGen)}.0 x${esc(g.pcieWidth)}` : '';
  return `<div>GPU${esc(g.index)} ${esc(shortGpuName(g.name))} · ${esc(gb(g.totalBytes))}${pcie}</div>`;
}

export function gpuHeadLabel(g) {
  return 'GPU ' + esc(g.index);
}

export function telemetryGpuHeaderHtml(g, gb) {
  return `<span>GPU ${esc(g.index)} (${esc(shortGpuName(g.name))})</span> <strong>${esc(gb(g.usedBytes))} / ${esc(gb(g.totalBytes))} (${esc(g.percent)}%)</strong>`;
}

export function telemetryMeterWidth(percent) {
  const value = Number(percent);
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function planRowHtml(c, describe, pendingLabel) {
  return `<td>${esc(describe(c))}</td><td>${esc(c.gpuLayers)}/${esc(c.totalLayers)}</td><td class="num">${esc(c.predicted.tpsShort)}</td><td class="num">…</td><td class="num">…</td><td class="num">…</td><td>${esc(pendingLabel)}</td>`;
}

export function loadSpeedHtml(genTps) {
  return `<span class="big">${esc(genTps)}</span>`;
}
