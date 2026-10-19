import test from 'node:test';
import assert from 'node:assert/strict';
import { t } from '../src/i18n/index.js';

test('i18n catalogs include all MCP keys in en and es without missing fallbacks', () => {
  const keys = [
    'web.addAsMcp',
    'web.addAsMcpTooltip',
    'web.mcpModalTitle',
    'web.mcpServerName',
    'web.mcpAdvancedOptions',
    'web.mcpBaseUrl',
    'web.mcpApiKey',
    'web.mcpSelectAgents',
    'web.mcpDetected',
    'web.mcpNotDetected',
    'web.mcpAlreadyConfigured',
    'web.mcpSuccess',
    'web.mcpSaveBtn',
    'errors.missingParameter'
  ];

  for (const k of keys) {
    const enVal = t('en', k, { engine: 'LM Studio', agents: 'Claude', param: 'test' });
    const esVal = t('es', k, { engine: 'LM Studio', agents: 'Claude', param: 'test' });
    assert.notEqual(enVal, k, `Missing English key ${k}`);
    assert.notEqual(esVal, k, `Missing Spanish key ${k}`);
  }
});
