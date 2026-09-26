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

  'errors.unknownLocale': 'Idioma desconocido "{lang}". Valores válidos: {list}',
  'errors.installNotFinished': 'La instalación no terminó. Vuelve a ejecutar llm-tuner cuando acabe.',
  'errors.modelDownloadFailed': 'No se pudo descargar el modelo',
  'errors.noInstaller': 'No hay un instalador automático para este sistema.',
  'errors.installerExit': 'El instalador terminó con código {code}',

  // Candidate description (CLI and web)
  'candidate.allGpu': 'todo en GPU',
  'candidate.layersGpu': '{gpu}/{total} capas en GPU',
  'candidate.expertsRam': ' · expertos de {layers} capas en RAM',
  'candidate.threads': ' · {n} hilos',
  'candidate.probe': ' · prueba optimista',

  // Shared by CLI and web
  'common.error': 'Error: {message}',
  'common.na': 'n/d',
  'common.longPrompt': 'prompt largo (~{tokens} tokens)…',
  'common.presetSaved': 'Preset guardado: {file}',
  'common.backups': 'Copias de seguridad: {list}',

  // CLI
  'cli.help': `llm-tuner — carga tu LLM local con la configuración más rápida para el contexto que necesitas

Uso: llm-tuner [opciones]
  --engine <lmstudio|ollama>   Motor
  --model <clave>              Modelo (clave de LM Studio o nombre de Ollama)
  --ctx <tokens>               Contexto (p. ej. 16384)
  --force                      Volver a medir aunque exista un preset
  --candidates <n>             Configuraciones a probar al medir (3)
  --yes                        No pedir confirmación
  --dry-run                    Medir y mostrar cambios sin aplicar nada ni guardar preset
  --presets                    Listar presets guardados
  --json                       Salida final en JSON
  --web                        Abrir la interfaz web
  --lang <en|es>               Idioma de la interfaz (se guarda para la próxima vez)

Los presets se guardan en {presetsDir}`,
  'cli.langNotSaved': 'No se pudo guardar la preferencia de idioma: {error}',
  'cli.noPresets': 'No hay presets guardados.',
  'cli.partial': 'parcial',
  'cli.display': ' · pantalla',
  'cli.noGpu': 'Sin GPU compatible: se usará solo CPU.',
  'cli.whichEngine': '¿Qué motor quieres usar?',
  'cli.installed': 'instalado',
  'cli.notInstalled': 'no instalado · se instalará',
  'cli.recommended': 'recomendado',
  'cli.noModels': '{engine} no tiene modelos descargados.',
  'cli.downloadOllama': 'Modelo a descargar (p. ej. qwen2.5-coder:14b):',
  'cli.downloadLms': 'Modelo a descargar (p. ej. qwen/qwen2.5-coder-14b):',
  'cli.model': 'Modelo:',
  'cli.maxFullGpu': 'Máximo con todo en GPU (estimado): {list} · entrenado hasta {train}K',
  'cli.tunedContexts': 'Contextos ya ajustados: {list}',
  'cli.context': 'Contexto (tokens):',
  'cli.contextRange': 'Entre 512 y {limit}',
  'cli.presetHit': 'Preset encontrado ({date}): {config} · {tps} t/s medidos. No hace falta volver a medir.',
  'cli.benchShort': '{tps} corto',
  'cli.benchDeep': ' · {tps} con {tokens} tokens',
  'cli.changes': 'Cambios:',
  'cli.lmsRestart': 'LM Studio se cerrará y se volverá a abrir para guardar la config de hardware.',
  'cli.ollamaNewModel': 'Nuevo modelo {name} con num_ctx/num_gpu/num_thread fijados',
  'cli.ollamaServer': 'Servidor Ollama: {env}',
  'cli.confirmApply': '¿Aplicar y cargar el modelo?',
  'cli.dryRun': '--dry-run: no se aplicó nada ni se guardó preset.',
  'cli.pending': 'Para terminar ejecuta (pide contraseña de administrador):',
  'cli.loaded': 'Modelo cargado en {engine}: {tps}',
  'cli.usesModel': ' (usa el modelo {model})',
  'cli.loadFailed': 'No se pudo cargar: {error}',
  'cli.installMethod': 'Método de instalación:',
  'cli.installNow': '¿Instalar ahora?',
  'cli.installManual': 'Instala la app descargada y pulsa Enter',
};
