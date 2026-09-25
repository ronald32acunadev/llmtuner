import os from 'node:os';
import si from 'systeminformation';
import { run, which, PLATFORM, MiB, GiB } from './util.js';

// Approximate memory bandwidth (GB/s) for common GPUs. Used only to rank
// candidates before benchmarking, so rough numbers are fine.
const GPU_BANDWIDTH = [
  [/RTX 5090/i, 1792], [/RTX 5080/i, 960], [/RTX 5070 Ti/i, 896], [/RTX 5070/i, 672], [/RTX 5060 Ti/i, 448], [/RTX 5060/i, 448],
  [/RTX 4090/i, 1008], [/RTX 4080/i, 717], [/RTX 4070 Ti/i, 504], [/RTX 4070/i, 504], [/RTX 4060 Ti/i, 288], [/RTX 4060/i, 272],
  [/RTX 3090/i, 936], [/RTX 3080/i, 760], [/RTX 3070/i, 448], [/RTX 3060 Ti/i, 448], [/RTX 3060/i, 360],
  [/RTX 20[0-9]0/i, 448], [/GTX 16[0-9]0/i, 192], [/GTX 10[0-9]0/i, 256],
  [/A100/i, 1935], [/H100/i, 3350], [/L40/i, 864], [/A6000/i, 768], [/A4000/i, 448],
  [/RX 9070 XT/i, 640], [/RX 9070/i, 640], [/RX 7900 XTX/i, 960], [/RX 7900/i, 800], [/RX 7800/i, 624], [/RX 7700/i, 432], [/RX 7600/i, 288],
  [/RX 6900|RX 6800/i, 512], [/RX 6700/i, 384],
  [/Arc A770/i, 560], [/Arc B580/i, 456],
];

// Apple Silicon unified memory bandwidth (GB/s).
const APPLE_BANDWIDTH = [
  [/M[1-5] Ultra/i, 800], [/M4 Max/i, 546], [/M[1-3] Max/i, 400], [/M4 Pro/i, 273], [/M[1-3] Pro/i, 200], [/M4/i, 120], [/M[1-3]/i, 100],
];

// PCIe per-lane throughput in GB/s by generation.
const PCIE_LANE_GBPS = { 1: 0.25, 2: 0.5, 3: 0.985, 4: 1.97, 5: 3.94, 6: 7.56 };

const lookup = (table, name, dflt) => (table.find(([re]) => re.test(name))?.[1] ?? dflt);

async function nvidiaGpus() {
  const smi = await which('nvidia-smi', PLATFORM === 'win32' ? ['C:\\Windows\\System32\\nvidia-smi.exe'] : []);
  if (!smi) return [];
  const fields = 'index,name,uuid,pci.bus_id,memory.total,memory.used,memory.free,pcie.link.gen.max,pcie.link.width.current,pcie.link.width.max,display_active';
  const r = await run(smi, [`--query-gpu=${fields}`, '--format=csv,noheader,nounits']);
  if (r.code !== 0) return [];
  return r.stdout.trim().split('\n').filter(Boolean).map((line) => {
    const [index, name, uuid, busId, total, used, free, gen, widthCur, widthMax, display] = line.split(',').map((s) => s.trim());
    const pcieGen = Number(gen) || null;
    // width.max reports the GPU's capability; width.current reflects the real slot.
    const pcieWidth = Number(widthCur) || Number(widthMax) || null;
    return {
      vendor: 'nvidia',
      backend: 'cuda',
      index: Number(index),
      name,
      uuid,
      busId,
      totalBytes: Number(total) * MiB,
      usedBytes: Number(used) * MiB,
      freeBytes: Number(free) * MiB,
      pcieGen,
      pcieWidth,
      pcieGBps: pcieGen && pcieWidth ? +(PCIE_LANE_GBPS[pcieGen] * pcieWidth).toFixed(1) : null,
      displayAttached: /enabled/i.test(display || ''),
      bandwidthGBps: lookup(GPU_BANDWIDTH, name, 400),
    };
  });
}

async function amdGpus() {
  const smi = await which('rocm-smi');
  if (!smi) return [];
  const r = await run(smi, ['--showmeminfo', 'vram', '--showproductname', '--json']);
  if (r.code !== 0) return [];
  let data;
  try { data = JSON.parse(r.stdout); } catch { return []; }
  return Object.entries(data)
    .filter(([k]) => /^card\d+/.test(k))
    .map(([k, v], i) => {
      const total = Number(v['VRAM Total Memory (B)'] || 0);
      const used = Number(v['VRAM Total Used Memory (B)'] || 0);
      const name = v['Card Series'] || v['Card series'] || v['Card model'] || k;
      return {
        vendor: 'amd', backend: 'rocm', index: i, name, uuid: k, busId: null,
        totalBytes: total, usedBytes: used, freeBytes: total - used,
        pcieGen: null, pcieWidth: null, pcieGBps: null, displayAttached: false,
        bandwidthGBps: lookup(GPU_BANDWIDTH, name, 400),
      };
    });
}

async function appleGpu(cpuBrand, totalMem) {
  if (PLATFORM !== 'darwin' || os.arch() !== 'arm64') return [];
  // macOS lets Metal wire roughly 2/3 of RAM on small machines, ~3/4 on larger ones.
  const usable = totalMem <= 36 * GiB ? totalMem * 0.67 : totalMem * 0.75;
  return [{
    vendor: 'apple', backend: 'metal', index: 0, name: `${cpuBrand} GPU`, uuid: 'apple-gpu', busId: null,
    totalBytes: usable, usedBytes: 0, freeBytes: usable, unifiedMemory: true,
    pcieGen: null, pcieWidth: null, pcieGBps: null, displayAttached: true,
    bandwidthGBps: lookup(APPLE_BANDWIDTH, cpuBrand, 100),
  }];
}

/** Fallback for GPUs without a vendor tool (Intel, AMD on Windows, ...). */
function genericGpus(controllers) {
  return controllers
    .filter((c) => c.vram && c.vram > 512 && !/microsoft basic|llvmpipe|virtual/i.test(c.model || ''))
    .map((c, i) => ({
      vendor: /nvidia/i.test(c.vendor) ? 'nvidia' : /amd|ati|advanced micro/i.test(c.vendor) ? 'amd' : /intel/i.test(c.vendor) ? 'intel' : 'other',
      backend: 'vulkan', index: i, name: c.model, uuid: c.busAddress || `gpu${i}`, busId: c.busAddress || null,
      totalBytes: c.vram * MiB, usedBytes: (c.memoryUsed ?? 0) * MiB, freeBytes: (c.memoryFree ?? c.vram) * MiB,
      pcieGen: null, pcieWidth: null, pcieGBps: null, displayAttached: false,
      bandwidthGBps: lookup(GPU_BANDWIDTH, c.model || '', 300),
      vramApproximate: true,
    }));
}

/**
 * Snapshot of the machine: CPU, RAM and GPUs (with free VRAM and PCIe link).
 * GPUs are sorted by suggested priority: fastest link / no display first.
 */
export async function detectHardware() {
  const [cpu, mem, osInfo, graphics] = await Promise.all([si.cpu(), si.mem(), si.osInfo(), si.graphics().catch(() => ({ controllers: [] }))]);
  const cpuBrand = `${cpu.manufacturer} ${cpu.brand}`.trim();

  let gpus = await nvidiaGpus();
  if (!gpus.length) gpus = await amdGpus();
  if (!gpus.length) gpus = await appleGpu(cpuBrand, mem.total);
  if (!gpus.length) gpus = genericGpus(graphics.controllers || []);

  return {
    os: { platform: PLATFORM, distro: osInfo.distro, release: osInfo.release, arch: os.arch() },
    cpu: {
      brand: cpuBrand,
      physicalCores: cpu.physicalCores || Math.max(1, Math.floor(os.cpus().length / 2)),
      threads: cpu.cores || os.cpus().length,
      avx2: /avx2/i.test(cpu.flags || ''),
    },
    ram: { totalBytes: mem.total, availableBytes: mem.available },
    // Dual-channel DDR4 ~40 GB/s, DDR5 ~70 GB/s; Apple uses unified memory.
    ramBandwidthGBps: gpus[0]?.unifiedMemory ? gpus[0].bandwidthGBps : 45,
    gpus: rankGpus(gpus),
  };
}

/**
 * Priority order for placing model layers: prefer the GPU with the widest
 * PCIe link, then the one not driving a display, then the most free VRAM.
 */
export function rankGpus(gpus) {
  return [...gpus].sort((a, b) =>
    (b.pcieGBps ?? 0) - (a.pcieGBps ?? 0) ||
    Number(a.displayAttached) - Number(b.displayAttached) ||
    b.freeBytes - a.freeBytes ||
    a.index - b.index);
}

/** Poll per-GPU VRAM usage (NVIDIA only) until stop() is called. */
export function startVramSampler(intervalMs = 500) {
  const peaks = new Map();
  let timer = null;
  let stopped = false;
  const tick = async () => {
    const gpus = await nvidiaGpus();
    for (const g of gpus) peaks.set(g.index, Math.max(peaks.get(g.index) ?? 0, g.usedBytes));
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  tick();
  return {
    stop() { stopped = true; clearTimeout(timer); return Object.fromEntries(peaks); },
  };
}

export { nvidiaGpus };
