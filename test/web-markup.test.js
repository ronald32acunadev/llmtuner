import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esc,
  hardwareGpuHtml,
  gpuHeadLabel,
  telemetryGpuHeaderHtml,
  telemetryMeterWidth,
  planRowHtml,
  loadSpeedHtml,
} from '../src/web/public/markup.js';

const evil = '<img src=x onerror=alert(1)>';
const gb = (bytes) => `${bytes} B`;
const describe = () => 'config';

test('esc escapes markup', () => {
  assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  assert.equal(esc(null), '');
  assert.equal(esc(3), '3');
});

test('hardware rows keep normal values', () => {
  const html1 = hardwareGpuHtml(
    { index: 0, name: 'NVIDIA GeForce RTX 5070', totalBytes: 1, pcieGen: 4, pcieWidth: 16 },
    gb
  );
  assert.equal(html1, '<div>GPU0 RTX 5070 · 1 B · PCIe 4.0 x16</div>');
  const html2 = hardwareGpuHtml(
    { index: 1, name: 'A', totalBytes: 2 },
    gb
  );
  assert.equal(html2, '<div>GPU1 A · 2 B</div>');
});

test('hardware rows escape remote values', () => {
  const html3 = hardwareGpuHtml(
    { index: evil, name: evil, totalBytes: 1, pcieGen: evil, pcieWidth: evil },
    gb
  );
  assert.ok(!html3.includes('<img'));
});

test('GPU labels escape remote values', () => {
  const label2 = gpuHeadLabel({ index: 2 });
  assert.equal(label2, 'GPU 2');
  const labelEvil = gpuHeadLabel({ index: evil });
  assert.ok(!labelEvil.includes('<img'));
});

test('telemetry headers escape remote values', () => {
  const header1 = telemetryGpuHeaderHtml(
    { index: 0, name: 'NVIDIA GeForce A', usedBytes: 1, totalBytes: 2, percent: 50 },
    gb
  );
  assert.equal(header1, '<span>GPU 0 (A)</span> <strong>1 B / 2 B (50%)</strong>');
  const headerEvil = telemetryGpuHeaderHtml(
    { index: evil, name: evil, usedBytes: evil, totalBytes: evil, percent: evil },
    gb
  );
  assert.ok(!headerEvil.includes('<img'));
});

test('telemetry width is always a number', () => {
  assert.equal(telemetryMeterWidth(50), 50);
  assert.equal(telemetryMeterWidth(150), 100);
  assert.equal(telemetryMeterWidth(-1), 0);
  assert.equal(telemetryMeterWidth(evil), 0);
});

test('plan rows escape remote values', () => {
  const row1 = planRowHtml(
    { gpuLayers: 1, totalLayers: 2, predicted: { tpsShort: 3 } },
    describe,
    'pending'
  );
  assert.equal(row1, '<td>config</td><td>1/2</td><td class="num">3</td><td class="num">…</td><td class="num">…</td><td class="num">…</td><td>pending</td>');
  const rowEvil = planRowHtml(
    { gpuLayers: evil, totalLayers: evil, predicted: { tpsShort: evil } },
    describe,
    'pending'
  );
  assert.ok(!rowEvil.includes('<img'));
});

test('load speed escapes remote values', () => {
  const load1 = loadSpeedHtml(12);
  assert.equal(load1, '<span class="big">12</span>');
  const loadEvil = loadSpeedHtml(evil);
  assert.ok(!loadEvil.includes('<img'));
});
