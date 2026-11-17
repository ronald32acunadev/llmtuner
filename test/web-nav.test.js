import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '../src/web/public/index.html');
const navModulePath = path.join(__dirname, '../src/web/public/navigation.js');

test('index.html contains primary navigation tabs in rail', async () => {
  const html = await fs.readFile(htmlPath, 'utf8');

  assert.match(html, /id="primary-nav"/, 'Must contain #primary-nav');
  assert.match(html, /data-tab="tuner"/, 'Must contain Tuner tab');
  assert.match(html, /data-tab="ollama"/, 'Must contain Ollama tab');
  assert.match(html, /data-tab="lmstudio"/, 'Must contain LM Studio tab');
  assert.match(html, /id="view-tuner"/, 'Must contain #view-tuner view');
  assert.match(html, /id="view-ollama"/, 'Must contain #view-ollama view');
  assert.match(html, /id="view-lmstudio"/, 'Must contain #view-lmstudio view');
});

test('navigation controller switches views and updates active tab state', async () => {
  const { createNavController } = await import(navModulePath);

  const tabs = [
    { dataset: { tab: 'tuner' }, classList: { toggle: (cls, on) => { tabs[0].active = on; } } },
    { dataset: { tab: 'ollama' }, classList: { toggle: (cls, on) => { tabs[1].active = on; } } },
    { dataset: { tab: 'lmstudio' }, classList: { toggle: (cls, on) => { tabs[2].active = on; } } },
  ];

  const views = {
    tuner: { hidden: false },
    ollama: { hidden: true },
    lmstudio: { hidden: true }
  };

  let activeTabChanged = null;
  const nav = createNavController({
    tabs,
    views,
    onTabChange: (tab) => { activeTabChanged = tab; }
  });

  assert.strictEqual(nav.currentTab(), 'tuner');
  assert.strictEqual(views.tuner.hidden, false);
  assert.strictEqual(views.ollama.hidden, true);

  nav.select('ollama');
  assert.strictEqual(nav.currentTab(), 'ollama');
  assert.strictEqual(views.tuner.hidden, true);
  assert.strictEqual(views.ollama.hidden, false);
  assert.strictEqual(views.lmstudio.hidden, true);
  assert.strictEqual(activeTabChanged, 'ollama');

  nav.select('tuner');
  assert.strictEqual(nav.currentTab(), 'tuner');
  assert.strictEqual(views.tuner.hidden, false);
  assert.strictEqual(views.ollama.hidden, true);
});
