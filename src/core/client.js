import { getActiveServer } from './settings.js';

export class TunerApiClient {
  constructor({ baseUrl = 'http://127.0.0.1:7860', token = null } = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.token = token;
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
    if (!response.ok) {
      let errMessage = `HTTP ${response.status}: ${response.statusText}`;
      let errCode = null;
      try {
        const errJson = await response.json();
        if (errJson?.error) errMessage = errJson.error;
        if (errJson?.code) errCode = errJson.code;
      } catch {}
      const err = new Error(errMessage);
      err.status = response.status;
      if (errCode) err.code = errCode;
      throw err;
    }

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

  async loadModel({ engine, model, ctx, profile, force, candidates }, onProgress) {
    const { jobId } = await this._request('/api/load', {
      method: 'POST',
      body: { engine, model, ctx, profile, force, candidates },
    });

    if (!onProgress) return { jobId };

    const response = await fetch(`${this.baseUrl}/api/jobs/${jobId}/events`, {
      headers: this.token ? { 'Authorization': `Bearer ${this.token}` } : {},
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
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

          if (data.type === 'finished') {
            if (data.ok === false) {
              const err = new Error(data.error || 'Job failed');
              if (data.code) err.code = data.code;
              throw err;
            }
            return data.result;
          }
        }
      }
    } finally {
      await reader.cancel();
    }
  }

  static fromSettings(settings) {
    const active = getActiveServer(settings);
    return new TunerApiClient({
      baseUrl: active.url,
      token: active.token,
    });
  }
}
