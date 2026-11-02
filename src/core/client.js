import { getActiveServer } from './settings.js';
import { TunerError } from './errors.js';

export class TunerApiClient {
  constructor({ baseUrl = 'http://127.0.0.1:7860', token = null } = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.token = token;
  }

  async _throwResponseError(response) {
    let errMessage = `HTTP ${response.status}: ${response.statusText}`;
    let errCode = null;
    let errParams = {};
    try {
      const errJson = await response.json();
      if (errJson?.error) errMessage = errJson.error;
      if (errJson?.code) errCode = errJson.code;
      if (errJson?.params) errParams = errJson.params;
    } catch {}
    const err = errCode ? new TunerError(errCode, errParams) : new Error(errMessage);
    err.status = response.status;
    throw err;
  }

  async _request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = { ...options.headers };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (options.body && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) await this._throwResponseError(response);

    return response.json();
  }

  async getState() {
    return this._request('/api/state');
  }

  async listModels(engine) {
    const query = engine ? `?engine=${encodeURIComponent(engine)}` : '';
    return this._request(`/api/models${query}`);
  }

  async planModel({ engine, model, ctx }) {
    return this._request('/api/plan', {
      method: 'POST',
      body: { engine, model, ctx },
    });
  }

  async listPresets({ engine, model } = {}) {
    const params = new URLSearchParams();
    if (engine) params.set('engine', engine);
    if (model) params.set('model', model);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this._request(`/api/presets${query}`);
  }

  async chat({ engine, model, messages }) {
    return this._request('/api/chat', {
      method: 'POST',
      body: { engine, model, messages },
    });
  }

  async loadModel({ engine, model, ctx, profile, force, candidates, dryRun, confirm }, onProgress, { confirmApply } = {}) {
    const { jobId } = await this._request('/api/load', {
      method: 'POST',
      body: { engine, model, ctx, profile, force, candidates, dryRun, confirm },
    });

    if (!onProgress) return { jobId };

    const response = await fetch(`${this.baseUrl}/api/jobs/${jobId}/events`, {
      headers: this.token ? { 'Authorization': `Bearer ${this.token}` } : {},
    });
    if (!response.ok) await this._throwResponseError(response);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        let chunk;
        try {
          chunk = await reader.read();
        } catch {
          throw new TunerError('web.connectionLost');
        }
        const { value, done } = chunk;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = JSON.parse(trimmed.slice(6));
          if (typeof onProgress === 'function') {
            onProgress(data);
          }

          if (data.type === 'confirmation-required' && confirmApply) {
            const accepted = await confirmApply(data.preview);
            await this.confirmLoad(jobId, { confirmationId: data.confirmationId, accepted });
          }

          if (data.type === 'finished') {
            // A failed job that still has a result (pending commands, failed load) is shown by the caller.
            if (data.result) return data.result;
            if (data.code) throw new TunerError(data.code, data.params);
            throw new Error(data.error || 'Job failed');
          }
        }
      }
      throw new TunerError('web.connectionLost');
    } finally {
      // Cancelling an errored stream rejects, which would replace the real error.
      await reader.cancel().catch(() => {});
    }
  }

  async confirmLoad(jobId, { confirmationId, accepted }) {
    return this._request(`/api/jobs/${jobId}/confirm`, {
      method: 'POST',
      body: { confirmationId, accepted },
    });
  }

  static fromSettings(settings) {
    const active = getActiveServer(settings);
    return new TunerApiClient({
      baseUrl: active.url,
      token: active.token,
    });
  }
}
