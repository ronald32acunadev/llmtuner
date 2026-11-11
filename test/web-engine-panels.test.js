import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupEngineDashboard } from '../src/web/public/engine-management.js';

function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(),
    children: [],
    attributes: {},
    dataset: {},
    style: {},
    classList: {
      classes: new Set(),
      add: (c) => el.classList.classes.add(c),
      remove: (c) => el.classList.classes.delete(c),
      toggle: (c, on) => { if (on) el.classList.classes.add(c); else el.classList.classes.delete(c); }
    },
    addEventListener: (event, handler) => {
      el.listeners = el.listeners || {};
      el.listeners[event] = el.listeners[event] || [];
      el.listeners[event].push(handler);
    },
    dispatchEvent: (e) => {
      const handlers = el.listeners?.[e.type] || [];
      handlers.forEach((h) => h(e));
    },
    appendChild: (child) => {
      el.children.push(child);
      child.parentNode = el;
      return child;
    },
    querySelector: (selector) => {
      if (selector === 'tbody') return createMockElement('tbody');
      return createMockElement('div');
    },
    querySelectorAll: () => [],
    closest: () => null,
  };
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html || '',
    set: (val) => { el._html = val; el.children = []; }
  });
  return el;
}

test('setupEngineDashboard initializes and fetches status, ps, models, and storage', async () => {
  const container = createMockElement('div');
  const calls = [];
  const mockApi = async (path) => {
    calls.push(path);
    if (path.endsWith('/status')) return { name: 'Ollama', running: true, version: '0.4.0', apiUrl: 'http://127.0.0.1:11434' };
    if (path.endsWith('/ps')) return { models: [{ name: 'llama3:8b', sizeVram: 4 * 1024 ** 3 }] };
    if (path.endsWith('/models')) return { models: [{ name: 'llama3:8b', key: 'llama3:8b', sizeBytes: 4 * 1024 ** 3, quant: 'Q4_0' }] };
    if (path.endsWith('/storage')) return { modelsDir: '/test/models', canEdit: true };
    return {};
  };

  const t = (k) => k;
  const esc = (s) => String(s);

  // global document mock for createElement
  globalThis.document = {
    createElement: (tag) => createMockElement(tag),
  };

  const dashboard = setupEngineDashboard({
    engineId: 'ollama',
    container,
    api: mockApi,
    t,
    esc,
    onTuneModel: () => {}
  });

  dashboard.stopPolling();
  await dashboard.refresh();

  assert.ok(calls.includes('/api/engines/ollama/status'), 'Must call status');
  assert.ok(calls.includes('/api/engines/ollama/ps'), 'Must call ps');
  assert.ok(calls.includes('/api/engines/ollama/models'), 'Must call models');
  assert.ok(calls.includes('/api/engines/ollama/storage'), 'Must call storage');
});
