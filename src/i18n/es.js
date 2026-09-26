// Spanish catalog. Same keys and {params} as en.js.
export default {
  // Engine choice
  'engine.reason.onlyInstalled': '{name} es el único instalado.',
  'engine.reason.multiGpu': 'Tienes varias GPUs: LM Studio permite fijar el orden de GPUs y el tipo de KV por modelo.',
  'engine.reason.singleGpu': 'Con una sola GPU ambos rinden igual; Ollama es más ligero y funciona como servicio.',
  'engine.reason.noneInstalled': 'No hay ningún motor instalado; se puede instalar automáticamente.',

  // Progress
  'status.freeingVram': 'Liberando VRAM (descargando modelos cargados)…',
  'status.engine': 'Motor: {name}',
  'status.searchNone': 'No hay preset para este contexto: buscando la mejor configuración…',
  'status.searchHardware': 'El hardware cambió desde el último preset: buscando la mejor configuración…',
  'status.searchModel': 'El archivo del modelo cambió: buscando la mejor configuración…',
  'status.searchForced': 'Nueva medición solicitada: buscando la mejor configuración…',
  'status.applying': 'Aplicando configuración…',
  'status.loading': 'Cargando el modelo…',

  // Errors
  'errors.unknownEngine': 'Motor desconocido: {engine}',
  'errors.noConfigWorked': 'Ninguna configuración funcionó con este contexto. Prueba con uno menor.',
  'errors.ggufNotFound': 'No encuentro el archivo GGUF de {key}',
  'errors.lmstudioOpen': 'LM Studio está abierto; ciérralo antes de aplicar la configuración.',
  'errors.ollamaUnknownModel': 'Ollama no reconoce el modelo {key}',

  // Install methods
  'install.ollamaScript': 'Script oficial (ollama.com/install.sh, pide sudo)',
  'install.ollamaBrew': 'Homebrew (brew install --cask ollama)',
  'install.ollamaDmg': 'Descargar Ollama.dmg',
  'install.ollamaWinget': 'winget (Ollama.Ollama)',
  'install.ollamaPs1': 'Script oficial PowerShell',
  'install.lmsHeadless': 'LM Studio sin interfaz (llmster + lms, sin sudo)',
  'install.lmsBrew': 'App de escritorio con Homebrew (brew install --cask lm-studio)',
  'install.lmsWinget': 'App de escritorio con winget (ElementLabs.LMStudio)',
  'install.lmsHeadlessPs1': 'LM Studio sin interfaz (llmster, script PowerShell)',
  'install.lmsDownload': 'Descargar la app de escritorio desde lmstudio.ai',

  // Benchmark and load results
  'bench.oom': 'Sin VRAM suficiente (OOM)',
  'bench.oomOnLoad': 'Sin VRAM suficiente (OOM al cargar)',
  'bench.lmsUnavailable': 'lms no disponible',
  'bench.ollamaTestServerFailed': 'No pude iniciar un servidor Ollama de pruebas: {detail}',
  'bench.loadFailed': 'No se pudo cargar el modelo',
  'bench.mainServerNote': 'Medido en el servidor principal: el tipo de KV y Flash Attention son los que ya tenga configurados.',

  // Applied changes
  'changes.lmsHardware': 'Config de hardware actualizada (orden de GPUs y límite de VRAM)',
  'changes.lmsModelFull': 'Config del modelo: {ctx} tokens, KV {kvType}, todas las capas en GPU, {threads} hilos',
  'changes.lmsModelPartial': 'Config del modelo: {ctx} tokens, KV {kvType}, {gpuLayers}/{totalLayers} capas en GPU, {threads} hilos',
  'changes.lmsRestarted': 'LM Studio reiniciado',
  'changes.ollamaExists': 'El modelo {name} ya existe; no se modifica',
  'changes.ollamaCreated': 'Modelo creado: {name}',
  'changes.ollamaSetx': 'Variables de entorno de usuario actualizadas (setx)',
  'changes.ollamaLaunchctl': 'Variables aplicadas con launchctl (hasta el próximo reinicio; añade también a tu perfil si quieres que persistan)',
  'changes.ollamaSystemd': 'Override de systemd instalado y Ollama reiniciado',
};
