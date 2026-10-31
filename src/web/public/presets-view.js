const sortedUnique = (values) => [...new Set(values)].sort();

export function presetFilters(presets) {
  return { engines: sortedUnique(presets.map((p) => p.engine)), models: sortedUnique(presets.map((p) => p.model)) };
}

export function filterPresets(presets, { engine, model } = {}) {
  return presets.filter((p) => {
    if (engine && p.engine !== engine) return false;
    if (model && p.model !== model) return false;
    return true;
  });
}

export function presetSummary(p, t) {
  const variant = p.variant && p.variant !== p.model ? ` (${p.variant})` : '';
  return {
    engine: p.engine,
    model: p.model,
    context: `${p.ctx / 1024}K`,
    profile: p.profile ? `${p.profile}${variant}` : '',
    kv: p.kvType,
    offload: p.fullOffload ? t('candidate.allGpu') : t('cli.partial'),
    tps: `${p.shortTps} t/s`,
    date: p.createdAt.slice(0, 16).replace('T', ' '),
  };
}
