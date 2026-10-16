import os from 'node:os';
import { nvidiaGpus } from './hardware.js';
import { cpuSnapshot, cpuBusyPercent } from './util.js';

/**
 * Sample RAM usage information.
 * @returns {{ totalBytes: number, freeBytes: number, usedBytes: number, percent: number }}
 */
export function sampleRam() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  const percent = totalBytes > 0 ? +(100 * (1 - freeBytes / totalBytes)).toFixed(1) : 0;
  return { totalBytes, freeBytes, usedBytes, percent };
}

/**
 * Sample GPU usage information.
 * @returns {Promise<Array<{ index: number, name: string, totalBytes: number, usedBytes: number, freeBytes: number, percent: number }>>}
 */
export async function sampleGpus() {
  const gpus = await nvidiaGpus();
  return gpus.map((g) => ({
    index: g.index,
    name: g.name,
    totalBytes: g.totalBytes,
    usedBytes: g.usedBytes,
    freeBytes: g.freeBytes,
    percent: g.totalBytes > 0 ? +(100 * (g.usedBytes / g.totalBytes)).toFixed(1) : 0,
  }));
}

/**
 * Start telemetry sampling at regular intervals.
 * @param {Function} onSample - Callback function to receive sample data
 * @param {number} intervalMs - Sampling interval in milliseconds (default: 500)
 * @returns {{ stop: () => void }} Object with stop method to cancel the sampler
 */
export function startTelemetrySampler(onSample, intervalMs = 500) {
  let timerId = null;
  let prevCpu = cpuSnapshot();
  let sampling = false;
  let stopped = false;

  const tick = async () => {
    if (sampling || stopped) return;
    sampling = true;
    try {
      const nowCpu = cpuSnapshot();
      const cpuPct = +(cpuBusyPercent(prevCpu, nowCpu)).toFixed(1);
      prevCpu = nowCpu;
      const ram = sampleRam();
      const gpus = await sampleGpus();
      if (!stopped) onSample({ cpu: { percent: cpuPct }, ram, gpus });
    } catch {
      // Ignore transient sampling errors
    } finally {
      sampling = false;
    }
  };

  timerId = setInterval(tick, intervalMs);

  return {
    stop() {
      stopped = true;
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    },
  };
}
