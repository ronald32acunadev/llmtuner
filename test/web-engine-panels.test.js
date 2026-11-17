import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupEngineDashboard } from '../src/web/public/engine-management.js';

function serializeHtml(element) {
  if (element.children.length === 0) return element._html || element._text || '';
  return element.children.map((c) => {
    const attrs = Object.entries(c.attributes).map(([k, v]) => (v ? `${k}="${v}"` : k)).join(' ');
    const openTag = `<${c.tagName.toLowerCase()}${attrs ? ' ' + attrs : ''}>`;
    const selfClosing = ['INPUT', 'IMG', 'BR', 'HR'].includes(c.tagName);
    if (selfClosing) return openTag;
    const closeTag = `</${c.tagName.toLowerCase()}>`;
    return openTag + serializeHtml(c) + closeTag;
  }).join('');
}

function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(),
    children: [],
    parentNode: null,
    attributes: {},
    dataset: {},
    style: {},
    _html: '',
    _text: '',
    classList: {
      classes: new Set(),
      add: (c) => el.classList.classes.add(c),
      remove: (c) => el.classList.classes.delete(c),
      toggle: (c, on) => { if (on) el.classList.classes.add(c); else el.classList.classes.delete(c); },
      contains: (c) => el.classList.classes.has(c),
    },
    addEventListener: (event, handler) => {
      el.listeners = el.listeners || {};
      el.listeners[event] = el.listeners[event] || [];
      el.listeners[event].push(handler);
    },
    dispatchEvent: async (e) => {
      e.target = e.target || el;
      e.preventDefault = e.preventDefault || (() => {});
      let curr = el;
      while (curr) {
        const handlers = curr.listeners?.[e.type] || [];
        for (const h of handlers) {
          await h(e);
        }
        curr = curr.parentNode;
      }
    },
    appendChild: (child) => {
      el.children.push(child);
      child.parentNode = el;
      return child;
    },
    querySelector: (sel) => querySelector(el, sel),
    querySelectorAll: (sel) => querySelectorAll(el, sel),
    closest: (sel) => {
      let curr = el;
      while (curr) {
        if (matchesSelector(curr, sel)) return curr;
        curr = curr.parentNode;
      }
      return null;
    },
  };

  Object.defineProperty(el, 'className', {
    get: () => Array.from(el.classList.classes).join(' '),
    set: (val) => {
      el.classList.classes.clear();
      (val || '').split(/\s+/).filter(Boolean).forEach((c) => el.classList.classes.add(c));
    }
  });

  Object.defineProperty(el, 'id', {
    get: () => el.attributes['id'] || '',
    set: (val) => { el.attributes['id'] = val; }
  });

  Object.defineProperty(el, 'innerHTML', {
    get: () => {
      if (el.children.length > 0) return serializeHtml(el);
      return el._html || '';
    },
    set: (val) => {
      el._html = val;
      el.children = parseHtml(val, el);
    }
  });

  Object.defineProperty(el, 'textContent', {
    get: () => el._text || '',
    set: (val) => { el._text = val; }
  });

  Object.defineProperty(el, 'value', {
    get: () => el._val ?? el.attributes['value'] ?? '',
    set: (val) => { el._val = val; }
  });

  Object.defineProperty(el, 'disabled', {
    get: () => el.attributes['disabled'] !== undefined,
    set: (val) => {
      if (val) el.attributes['disabled'] = '';
      else delete el.attributes['disabled'];
    }
  });

  return el;
}

function matchesSelector(el, selector) {
  if (!el || !el.tagName) return false;
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));

  const tagMatch = selector.match(/^([a-z0-9_-]+)/i);
  const tag = tagMatch ? tagMatch[1] : null;
  if (tag && el.tagName !== tag.toUpperCase()) return false;

  const attrMatches = Array.from(selector.matchAll(/\[([a-z0-9_-]+)(?:=["']([^"']*)["'])?\]/gi));
  if (attrMatches.length > 0) {
    for (const [, attr, val] of attrMatches) {
      const lowerAttr = attr.toLowerCase();
      if (val !== undefined) {
        if (el.attributes[lowerAttr] === val) continue;
        const dataKey = lowerAttr.startsWith('data-') ? lowerAttr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) : null;
        if (dataKey && el.dataset[dataKey] === val) continue;
        return false;
      }
      if (lowerAttr in el.attributes) continue;
      const dataKey = lowerAttr.startsWith('data-') ? lowerAttr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) : null;
      if (dataKey && dataKey in el.dataset) continue;
      return false;
    }
    return true;
  }

  return el.tagName === selector.toUpperCase();
}

function querySelectorAll(root, selector) {
  const matches = [];
  function walk(node) {
    for (const child of node.children) {
      if (matchesSelector(child, selector)) matches.push(child);
      walk(child);
    }
  }
  walk(root);
  return matches;
}

function querySelector(root, selector) {
  const all = querySelectorAll(root, selector);
  return all.length > 0 ? all[0] : null;
}

function parseHtml(html, parentNode = null) {
  const root = { children: [], _text: '', _html: '' };
  const tokenRegex = /<(\/)?([a-z0-9_-]+)([^>]*)>|([^<]+)/gi;
  let match;
  const stack = [root];
  while ((match = tokenRegex.exec(html)) !== null) {
    if (match[4]) {
      const text = match[4];
      const curr = stack[stack.length - 1];
      curr._text = (curr._text || '') + text;
      curr._html = (curr._html || '') + text;
      continue;
    }
    const isClose = match[1] === '/';
    const tagName = match[2].toLowerCase();
    const attrsStr = match[3];
    if (isClose) {
      if (stack.length > 1 && stack[stack.length - 1].tagName === tagName.toUpperCase()) {
        stack.pop();
      }
    } else {
      const el = createMockElement(tagName);
      const attrRegex = /([a-z0-9_-]+)(?:=["']([^"']*)["'])?/gi;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
        const attrName = attrMatch[1].toLowerCase();
        const attrVal = attrMatch[2] ?? '';
        el.attributes[attrName] = attrVal;
        if (attrName.startsWith('data-')) {
          const key = attrName.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          el.dataset[key] = attrVal;
        }
        if (attrName === 'id') el.id = attrVal;
        if (attrName === 'class') el.className = attrVal;
      }
      el.parentNode = stack[stack.length - 1] === root ? parentNode : stack[stack.length - 1];
      stack[stack.length - 1].children.push(el);
      const selfClosing = /\/\s*$/.test(attrsStr) || ['input', 'img', 'br', 'hr'].includes(tagName);
      if (!selfClosing) {
        stack.push(el);
      }
    }
  }
  return root.children;
}

// Global document mock for createElement
globalThis.document = {
  createElement: (tag) => createMockElement(tag),
};

test('US-01 / AC-02: setupEngineDashboard does not call api() on initialization when autoRefresh is omitted or false', async () => {
  const container = createMockElement('div');
  const calls = [];
  const mockApi = async (path) => {
    calls.push(path);
    if (path.endsWith('/status')) return { name: 'Ollama', running: true, version: '0.4.0', apiUrl: 'http://127.0.0.1:11434' };
    if (path.endsWith('/ps')) return { models: [] };
    if (path.endsWith('/models')) return { models: [] };
    if (path.endsWith('/storage')) return { modelsDir: '/test/models', canEdit: true };
    return {};
  };

  const dashboard = setupEngineDashboard({
    engineId: 'ollama',
    container,
    api: mockApi,
    t: (k) => k,
    esc: (s) => String(s),
    onTuneModel: () => {}
  });

  assert.strictEqual(calls.length, 0, 'Must NOT call api() on initialization when autoRefresh is omitted');

  await dashboard.refresh();
  assert.ok(calls.includes('/api/engines/ollama/status'), 'Must call status on refresh');
  assert.ok(calls.includes('/api/engines/ollama/ps'), 'Must call ps on refresh');
  assert.ok(calls.includes('/api/engines/ollama/models'), 'Must call models on refresh');
  assert.ok(calls.includes('/api/engines/ollama/storage'), 'Must call storage on refresh');
  dashboard.stopPolling();
});

test('US-05 / AC-01: Active models section renders model name, VRAM usage, details, expiration (web.colExpires), and triggers unload', async () => {
  const container = createMockElement('div');
  const apiCalls = [];
  const mockApi = async (path, body, method) => {
    apiCalls.push({ path, body, method });
    if (path.endsWith('/status')) return { name: 'Ollama', running: true };
    if (path.endsWith('/ps')) {
      return {
        models: [
          {
            name: 'llama3:8b',
            sizeVram: 4 * 1024 ** 3,
            details: { parameter_size: '8B', quantization_level: 'Q4_0' },
            expiresAt: '2026-11-16T21:00:00.000Z'
          }
        ]
      };
    }
    if (path.endsWith('/models')) return { models: [] };
    if (path.endsWith('/storage')) return { modelsDir: '/test', canEdit: true };
    if (path.endsWith('/unload')) return { ok: true, unloaded: body.model };
    return {};
  };

  const dashboard = setupEngineDashboard({
    engineId: 'ollama',
    container,
    api: mockApi,
    t: (k) => k,
    esc: (s) => String(s),
    onTuneModel: () => {}
  });

  await dashboard.refresh();

  assert.ok(container.innerHTML.includes('web.colExpires'), 'Active models table header must include web.colExpires');
  assert.ok(container.innerHTML.includes('llama3:8b'), 'Active models table must render model name');
  assert.ok(container.innerHTML.includes('4.00 GB'), 'Active models table must render formatted VRAM');

  const unloadBtn = container.querySelector('button[data-action="unload"]');
  assert.ok(unloadBtn, 'Unload button must exist');
  assert.strictEqual(unloadBtn.dataset.name, 'llama3:8b');

  await unloadBtn.dispatchEvent({ type: 'click' });

  const unloadCall = apiCalls.find((c) => c.path === '/api/engines/ollama/unload');
  assert.ok(unloadCall, 'Must call /api/engines/ollama/unload');
  assert.deepStrictEqual(unloadCall.body, { model: 'llama3:8b' });
  dashboard.stopPolling();
});

test('US-05 / AC-02: Installed models section renders presetReady badge, triggers load (with unoptimized notice), tune, and DELETE via api()', async () => {
  const container = createMockElement('div');
  const apiCalls = [];
  const mockApi = async (path, body, method) => {
    apiCalls.push({ path, body, method });
    if (path.endsWith('/status')) return { name: 'Ollama', running: true };
    if (path.endsWith('/ps')) return { models: [] };
    if (path.endsWith('/models') && (!method || method === 'GET')) {
      return {
        models: [
          { name: 'llama3:8b', key: 'llama3:8b', sizeBytes: 4 * 1024 ** 3, quant: 'Q4_0', hasPreset: true },
          { name: 'mistral:7b', key: 'mistral:7b', sizeBytes: 3.5 * 1024 ** 3, quant: 'Q4_K_M', hasPreset: false }
        ]
      };
    }
    if (path.endsWith('/models') && method === 'DELETE') {
      return { ok: true, deleted: body.model };
    }
    if (path.endsWith('/load')) {
      return { ok: true, unoptimized: true, loaded: body.model };
    }
    if (path.endsWith('/storage')) return { modelsDir: '/test', canEdit: true };
    return {};
  };

  let tunedModel = null;
  const onTuneModel = async (engineId, modelKey) => {
    tunedModel = { engineId, modelKey };
  };

  let confirmAsked = null;
  globalThis.confirm = (msg) => {
    confirmAsked = msg;
    return true;
  };

  const dashboard = setupEngineDashboard({
    engineId: 'ollama',
    container,
    api: mockApi,
    t: (k, p) => (p?.model ? `${k}:${p.model}` : k),
    esc: (s) => String(s),
    onTuneModel
  });

  await dashboard.refresh();

  assert.ok(container.innerHTML.includes('web.presetReady'), 'Must render web.presetReady badge when hasPreset is true');

  const tuneBtn = container.querySelector('button[data-action="tune"][data-name="llama3:8b"]');
  assert.ok(tuneBtn, 'Tune button must exist');
  await tuneBtn.dispatchEvent({ type: 'click' });
  assert.deepStrictEqual(tunedModel, { engineId: 'ollama', modelKey: 'llama3:8b' });

  const loadBtn = container.querySelector('button[data-action="load"][data-name="mistral:7b"]');
  assert.ok(loadBtn, 'Load button must exist');
  await loadBtn.dispatchEvent({ type: 'click' });
  const loadCall = apiCalls.find((c) => c.path === '/api/engines/ollama/load');
  assert.ok(loadCall, 'Must call /api/engines/ollama/load');
  assert.deepStrictEqual(loadCall.body, { model: 'mistral:7b' });
  assert.ok(container.innerHTML.includes('web.unoptimizedNotice'), 'Must display web.unoptimizedNotice when unoptimized: true');

  const deleteBtn = container.querySelector('button[data-action="delete"][data-name="llama3:8b"]');
  assert.ok(deleteBtn, 'Delete button must exist');
  await deleteBtn.dispatchEvent({ type: 'click' });
  assert.ok(confirmAsked?.includes('llama3:8b'), 'Must ask confirmation with model name');
  const deleteCall = apiCalls.find((c) => c.path === '/api/engines/ollama/models' && c.method === 'DELETE');
  assert.ok(deleteCall, 'Must call api() with DELETE method, not raw fetch');
  assert.deepStrictEqual(deleteCall.body, { model: 'llama3:8b' });
  dashboard.stopPolling();
});

test('Storage panel disables input when canEdit is false and submits path', async () => {
  const container = createMockElement('div');
  const apiCalls = [];
  let currentCanEdit = false;
  const mockApi = async (path, body) => {
    apiCalls.push({ path, body });
    if (path.endsWith('/status')) return { name: 'Ollama', running: true };
    if (path.endsWith('/ps')) return { models: [] };
    if (path.endsWith('/models')) return { models: [] };
    if (path.endsWith('/storage') && !body) return { modelsDir: '/test/models', canEdit: currentCanEdit };
    if (path.endsWith('/storage') && body) {
      return { ok: true, requiresRestart: true, manualCommand: 'systemctl restart ollama' };
    }
    return {};
  };

  const dashboard = setupEngineDashboard({
    engineId: 'ollama',
    container,
    api: mockApi,
    t: (k) => k,
    esc: (s) => String(s),
    onTuneModel: () => {}
  });

  await dashboard.refresh();

  const inputDisabled = container.querySelector('input[name="path"]');
  assert.ok(inputDisabled, 'Storage path input must exist');
  assert.strictEqual(inputDisabled.attributes['disabled'], '', 'Input must be disabled when canEdit is false');

  currentCanEdit = true;
  await dashboard.refresh();

  const inputEnabled = container.querySelector('input[name="path"]');
  assert.strictEqual(inputEnabled.attributes['disabled'], undefined, 'Input must NOT be disabled when canEdit is true');

  const form = container.querySelector('#storage-form');
  inputEnabled.value = '/new/models';
  inputEnabled.attributes['value'] = '/new/models';
  await form.dispatchEvent({ type: 'submit' });

  const storagePost = apiCalls.find((c) => c.path === '/api/engines/ollama/storage' && c.body);
  assert.ok(storagePost, 'Must submit storage path via api');
  assert.ok(container.innerHTML.includes('web.pathUpdatedRestartNotice'), 'Must show restart notice');
  assert.ok(container.innerHTML.includes('systemctl restart ollama'), 'Must show manual command');
  dashboard.stopPolling();
});
