export class TerminalAnimation {
  constructor(colors, isTTY = true) {
    this.c = colors;
    this.isTTY = Boolean(isTTY);
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.frameIdx = 0;
    this.timer = null;
    this.statusText = '';
    this.pct = 0;
    this.telemetry = null;
    this.isActive = false;
  }

  start(initialStatus = '') {
    if (!this.isTTY) return;
    this.statusText = initialStatus;
    this.isActive = true;
    this.timer = setInterval(() => {
      this.tick();
    }, 80);
    this.timer?.unref?.();
  }

  updateStatus(text) {
    this.statusText = text || '';
    this.tick();
  }

  updateProgress(pct) {
    this.pct = Math.min(100, Math.max(0, pct ?? 0));
    this.tick();
  }

  updateTelemetry(telem) {
    this.telemetry = telem;
    this.tick();
  }

  clear() {
    if (this.isTTY && this.isActive) {
      process.stdout.write('\r\x1b[K');
    }
  }

  tick() {
    if (!this.isTTY || !this.isActive) return;
    const frame = this.frames[(this.frameIdx++) % this.frames.length];

    const barLen = 16;
    const filled = Math.round((this.pct / 100) * barLen);
    const bar = this.c.cyan('━'.repeat(filled)) + this.c.dim('─'.repeat(barLen - filled));

    let telemStr = '';
    if (this.telemetry) {
      if (this.telemetry.cpu) {
        telemStr += ` · CPU ${this.telemetry.cpu.percent}%`;
      }
      if (this.telemetry.ram) {
        const used = (this.telemetry.ram.usedBytes / 1024 ** 3).toFixed(1);
        const total = (this.telemetry.ram.totalBytes / 1024 ** 3).toFixed(1);
        telemStr += ` · RAM ${used}/${total} GB`;
      }
      if (this.telemetry.gpus?.length) {
        telemStr += ' · ' + this.telemetry.gpus.map((g) => {
          const used = (g.usedBytes / 1024 ** 3).toFixed(1);
          const total = (g.totalBytes / 1024 ** 3).toFixed(1);
          return `GPU${g.index} ${used}/${total} GB`;
        }).join(' ');
      }
    }

    const statusPart = this.statusText ? `${this.statusText} ` : '';
    const line = `  ${this.c.cyan(frame)} ${statusPart}[${bar}] ${String(this.pct).padStart(3)}%${this.c.dim(telemStr)}`;
    process.stdout.write(`\r\x1b[K${line}`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.clear();
    this.isActive = false;
  }
}
