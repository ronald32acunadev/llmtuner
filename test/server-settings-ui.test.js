import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupServerSettings } from '../src/web/public/server-settings.js';

function createFakeDOM() {
  const elements = {};
  const handlers = new Map();
  const document = {
    getElementById: (id) => elements[id],
    addEventListener: (type, cb) => {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(cb);
    }
  };

  const ids = [
    'local-server-settings', 'local-server-autostart', 'local-server-status',
    'local-server-feedback', 'server-token', 'server-token-reveal',
    'server-token-copy', 'server-connection-info', 'settings-close',
    'settings-backdrop', 'settings-open'
  ];

  ids.forEach(id => {
    elements[id] = {
      id, hidden: false, value: '', disabled: false, textContent: '',
      addEventListener: (type, cb) => {
        if (!handlers.has(`${id}:${type}`)) handlers.set(`${id}:${type}`, []);
        handlers.get(`${id}:${type}`).push(cb);
      },
      async fire(type, event = {}) {
        const callbacks = handlers.get(`${id}:${type}`) || [];
        for (const cb of callbacks) await cb(event);
      }
    };
  });
  elements['local-server-settings'].hidden = true;
  elements['server-token'].type = 'password';

  return { document, elements };
}

const t = (key, params) => key + (params ? JSON.stringify(params) : '');

describe('server-settings-ui', () => {
  test('no bridge: section remains hidden', async () => {
    const { document, elements } = createFakeDOM();
    await setupServerSettings({ document, bridge: null, t });
    assert.strictEqual(elements['local-server-settings'].hidden, true);
  });

  test('autostart flow: toggle and restore on failure', async () => {
    const { document, elements } = createFakeDOM();
    const bridge = {
      getAutostartStatus: async () => false,
      setAutostartEnabled: async (val) => val === true ? true : Promise.reject(new Error('deny'))
    };
    await setupServerSettings({ document, bridge, t });
    assert.strictEqual(elements['local-server-autostart'].value, 'disabled');
    assert.strictEqual(elements['local-server-autostart'].disabled, false);
    assert.match(elements['local-server-status'].textContent, /web\.serverStartupDisabled/);

    elements['local-server-autostart'].value = 'enabled';
    await elements['local-server-autostart'].fire('change');
    assert.strictEqual(elements['local-server-autostart'].value, 'enabled');
    assert.match(elements['local-server-status'].textContent, /web\.serverStartupEnabled/);

    elements['local-server-autostart'].value = 'disabled';
    await elements['local-server-autostart'].fire('change');
    assert.strictEqual(elements['local-server-autostart'].value, 'enabled');
    assert.match(elements['local-server-feedback'].textContent, /deny/);
  });

  test('token reveal and copy flow', async () => {
    const { document, elements } = createFakeDOM();
    let revealCount = 0, copyCount = 0;
    const bridge = {
      getAutostartStatus: async () => true,
      revealConnection: async () => {
        revealCount++;
        return { configured: true, host: '0.0.0.0', port: 7860, token: 'test-token' };
      },
      copyToken: async () => {
        copyCount++;
        return { copied: true };
      }
    };
    await setupServerSettings({ document, bridge, t });
    assert.strictEqual(elements['server-token'].value, '');
    assert.strictEqual(revealCount, 0);

    await elements['server-token-reveal'].fire('click');
    assert.strictEqual(elements['server-token'].value, 'test-token');
    await elements['server-token-reveal'].fire('click');
    assert.strictEqual(elements['server-token'].value, '');

    await elements['server-token-reveal'].fire('click');
    await elements['server-token-copy'].fire('click');
    assert.match(elements['local-server-feedback'].textContent, /web\.serverTokenCopied/);
    assert.strictEqual(copyCount, 1);
  });

  test('token copy clipboard failure', async () => {
    const { document, elements } = createFakeDOM();
    const bridge = {
      getAutostartStatus: async () => true,
      revealConnection: async () => ({ configured: true, host: '0.0.0.0', port: 7860, token: 't' }),
      copyToken: async () => { throw new Error('clip-err'); }
    };
    await setupServerSettings({ document, bridge, t });
    await elements['server-token-reveal'].fire('click');
    await elements['server-token-copy'].fire('click');
    assert.match(elements['local-server-feedback'].textContent, /clip-err/);
  });

  test('missing config reveal', async () => {
    const { document, elements } = createFakeDOM();
    const bridge = {
      getAutostartStatus: async () => true,
      revealConnection: async () => ({ configured: false })
    };
    await setupServerSettings({ document, bridge, t });
    await elements['server-token-reveal'].fire('click');
    assert.strictEqual(elements['server-token'].value, '');
    assert.match(elements['local-server-feedback'].textContent, /web\.serverNoConfig/);
  });

  test('close-during-reveal race', async () => {
    const { document, elements } = createFakeDOM();
    let resolveReveal;
    const bridge = {
      getAutostartStatus: async () => true,
      revealConnection: () => new Promise(res => { resolveReveal = res; })
    };
    await setupServerSettings({ document, bridge, t });

    const revealPromise = elements['server-token-reveal'].fire('click');
    await elements['settings-close'].fire('click');
    resolveReveal({ configured: true, host: '0.0.0.0', port: 7860, token: 'late-token' });
    await revealPromise;
    assert.strictEqual(elements['server-token'].value, '');
  });
});
