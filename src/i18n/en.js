// English catalog: the base language. Every key here must also exist in es.js.
export default {
  // Engine choice
  'engine.reason.onlyInstalled': '{name} is the only one installed.',
  'engine.reason.multiGpu': 'You have several GPUs: LM Studio lets you set the GPU order and the KV type per model.',
  'engine.reason.singleGpu': 'With a single GPU both perform the same; Ollama is lighter and runs as a service.',
  'engine.reason.noneInstalled': 'No engine is installed; one can be installed automatically.',

  // Progress
  'status.freeingVram': 'Freeing VRAM (unloading loaded models)…',
  'status.engine': 'Engine: {name}',
  'status.searchNone': 'No preset for this context: looking for the best configuration…',
  'status.searchHardware': 'The hardware changed since the last preset: looking for the best configuration…',
  'status.searchModel': 'The model file changed: looking for the best configuration…',
  'status.searchForced': 'New measurement requested: looking for the best configuration…',
  'status.applying': 'Applying configuration…',
  'status.loading': 'Loading the model…',

  // Errors
  'errors.unknownEngine': 'Unknown engine: {engine}',
  'errors.noConfigWorked': 'No configuration worked with this context. Try a smaller one.',
  'errors.ggufNotFound': 'Cannot find the GGUF file for {key}',
  'errors.lmstudioOpen': 'LM Studio is open; close it before applying the configuration.',
  'errors.ollamaUnknownModel': 'Ollama does not recognize the model {key}',

  // Install methods
  'install.ollamaScript': 'Official script (ollama.com/install.sh, asks for sudo)',
  'install.ollamaBrew': 'Homebrew (brew install --cask ollama)',
  'install.ollamaDmg': 'Download Ollama.dmg',
  'install.ollamaWinget': 'winget (Ollama.Ollama)',
  'install.ollamaPs1': 'Official PowerShell script',
  'install.lmsHeadless': 'LM Studio headless (llmster + lms, no sudo)',
  'install.lmsBrew': 'Desktop app with Homebrew (brew install --cask lm-studio)',
  'install.lmsWinget': 'Desktop app with winget (ElementLabs.LMStudio)',
  'install.lmsHeadlessPs1': 'LM Studio headless (llmster, PowerShell script)',
  'install.lmsDownload': 'Download the desktop app from lmstudio.ai',

  // Benchmark and load results
  'bench.oom': 'Not enough VRAM (OOM)',
  'bench.oomOnLoad': 'Not enough VRAM (OOM while loading)',
  'bench.lmsUnavailable': 'lms is not available',
  'bench.ollamaTestServerFailed': 'Could not start a test Ollama server: {detail}',
  'bench.loadFailed': 'Could not load the model',
  'bench.mainServerNote': 'Measured on the main server: the KV type and Flash Attention are whatever it already has configured.',

  // Applied changes
  'changes.lmsHardware': 'Hardware config updated (GPU order and VRAM limit)',
  'changes.lmsModelFull': 'Model config: {ctx} tokens, KV {kvType}, all layers on GPU, {threads} threads',
  'changes.lmsModelPartial': 'Model config: {ctx} tokens, KV {kvType}, {gpuLayers}/{totalLayers} layers on GPU, {threads} threads',
  'changes.lmsRestarted': 'LM Studio restarted',
  'changes.ollamaExists': 'The model {name} already exists; left unchanged',
  'changes.ollamaCreated': 'Model created: {name}',
  'changes.ollamaSetx': 'User environment variables updated (setx)',
  'changes.ollamaLaunchctl': 'Variables set with launchctl (until the next reboot; also add them to your profile if you want them to persist)',
  'changes.ollamaSystemd': 'systemd override installed and Ollama restarted',

  'errors.unknownLocale': 'Unknown language "{lang}". Valid values: {list}',
  'errors.unknownTheme': 'Unknown theme "{theme}". Valid values: {list}',
  'errors.installNotFinished': 'The installation did not finish. Run llm-tuner again when it is done.',
  'errors.modelDownloadFailed': 'Could not download the model',
  'errors.noInstaller': 'There is no automatic installer for this system.',
  'errors.installerExit': 'The installer exited with code {code}',

  // Candidate description (CLI and web)
  'candidate.allGpu': 'all on GPU',
  'candidate.layersGpu': '{gpu}/{total} layers on GPU',
  'candidate.expertsRam': ' · experts of {layers} layers in RAM',
  'candidate.threads': ' · {n} threads',
  'candidate.probe': ' · optimistic probe',

  // Shared by CLI and web
  'common.error': 'Error: {message}',
  'common.na': 'n/a',
  'common.longPrompt': 'long prompt (~{tokens} tokens)…',
  'common.presetSaved': 'Preset saved: {file}',
  'common.backups': 'Backups: {list}',

  // CLI
  'cli.help': `llm-tuner — load your local LLM with the fastest configuration for the context you need

Usage: llm-tuner [options]
  --engine <lmstudio|ollama>   Engine
  --model <key>                Model (LM Studio key or Ollama name)
  --ctx <tokens>               Context (e.g. 16384)
  --force                      Measure again even if a preset exists
  --candidates <n>             Configurations to test when measuring (3)
  --yes                        Do not ask for confirmation
  --dry-run                    Measure and show the changes without applying anything or saving a preset
  --presets                    List saved presets
  --json                       Final output as JSON
  --web                        Open the web interface
  --lang <en|es>               Interface language (saved for next time)

Presets are saved in {presetsDir}`,
  'cli.langNotSaved': 'Could not save the language preference: {error}',
  'cli.noPresets': 'No saved presets.',
  'cli.partial': 'partial',
  'cli.display': ' · display',
  'cli.noGpu': 'No compatible GPU: only the CPU will be used.',
  'cli.whichEngine': 'Which engine do you want to use?',
  'cli.installed': 'installed',
  'cli.notInstalled': 'not installed · will be installed',
  'cli.recommended': 'recommended',
  'cli.noModels': '{engine} has no downloaded models.',
  'cli.downloadOllama': 'Model to download (e.g. qwen2.5-coder:14b):',
  'cli.downloadLms': 'Model to download (e.g. qwen/qwen2.5-coder-14b):',
  'cli.model': 'Model:',
  'cli.maxFullGpu': 'Maximum fully on GPU (estimated): {list} · trained up to {train}K',
  'cli.tunedContexts': 'Contexts already tuned: {list}',
  'cli.context': 'Context (tokens):',
  'cli.contextRange': 'Between 512 and {limit}',
  'cli.presetHit': 'Preset found ({date}): {config} · {tps} t/s measured. No need to measure again.',
  'cli.benchShort': '{tps} short',
  'cli.benchDeep': ' · {tps} with {tokens} tokens',
  'cli.changes': 'Changes:',
  'cli.lmsRestart': 'LM Studio will close and reopen to save the hardware config.',
  'cli.ollamaNewModel': 'New model {name} with num_ctx/num_gpu/num_thread fixed',
  'cli.ollamaServer': 'Ollama server: {env}',
  'cli.confirmApply': 'Apply and load the model?',
  'cli.dryRun': '--dry-run: nothing was applied and no preset was saved.',
  'cli.pending': 'To finish, run (asks for the administrator password):',
  'cli.loaded': 'Model loaded in {engine}: {tps}',
  'cli.usesModel': ' (uses the model {model})',
  'cli.loadFailed': 'Could not load: {error}',
  'cli.installMethod': 'Install method:',
  'cli.installNow': 'Install now?',
  'cli.installManual': 'Install the downloaded app and press Enter',

  'errors.unknownInstallPlan': 'Unknown install plan',
  'errors.loadInProgress': 'A load is already in progress',
  'errors.invalidChatRequest': 'Invalid chat request',

  // Web UI
  'web.tagline': 'load your model with the fastest configuration',
  'web.language': 'Language',
  'web.stepEngine': 'Engine',
  'web.modelAndContext': 'Model and context',
  'web.stepLoad': 'Load',
  'web.detectingHw': 'Detecting hardware…',
  'web.railNote': 'The configuration is decided from your hardware, the model metadata and real measurements. The result is saved as a preset: it is only measured again if you change the context.',
  'web.whichEngine': 'Which engine do you want to use?',
  'web.installMethod': 'Install method',
  'web.install': 'Install',
  'web.model': 'Model',
  'web.context': 'Context (tokens)',
  'web.loadButton': 'Load',
  'web.force': 'Measure again even if a preset exists',
  'web.loading': 'Loading',
  'web.inProgress': 'in progress',
  'web.benchIntro': 'There is no preset for this context: several configurations are tested on your hardware. It takes a few minutes and only happens once.',
  'web.colConfig': 'Configuration',
  'web.colGpuLayers': 'GPU layers',
  'web.colEstimated': 'Estimated',
  'web.colShort': 'Short',
  'web.colDeep': 'With context',
  'web.colVram': 'Peak VRAM',
  'web.connectionLost': 'Lost connection to the local server',
  'web.noGpu': 'No compatible GPU (CPU only)',
  'web.recommended': 'recommended',
  'web.installed': 'Installed',
  'web.notInstalled': 'Not installed: it will be installed when you choose it',
  'web.readingModels': 'Reading models…',
  'web.noModels': 'No downloaded models',
  'web.needsAdmin': 'This installer asks for the administrator password. Run in a terminal:\n\n  {command}\n\nThen reload this page.',
  'web.downloadOpened': 'The download was opened. Install the app and reload this page.',
  'web.installDone': 'Installation finished.',
  'web.installerFailed': 'the installer failed',
  'web.readingModel': 'Reading the model…',
  'web.modelReadFailed': 'Could not read the model: {error}',
  'web.layers': '{n} layers',
  'web.trainedUpTo': 'trained up to {ctx}',
  'web.maxAllGpu': 'maximum all on GPU: {list}',
  'web.presetSavedTitle': 'Saved preset · {tps} t/s',
  'web.fitsGpu': 'Fits entirely on GPU',
  'web.mayNeedKv': 'May need compressed KV or part on CPU',
  'web.presetPillSaved': 'saved preset · {tps} t/s',
  'web.presetPillNone': 'no preset · will be measured',
  'web.gpuLayers': '{layers} layers · {used} of {free} free',
  'web.vramAria': 'Estimated VRAM use on GPU {index}',
  'web.legendOther': 'Other processes',
  'web.legendModel': 'Model and context (estimated for the best option)',
  'web.loadingTitle': 'Loading {model} with {ctx} of context',
  'web.presetHit': 'Preset found ({date}): {config}. No measurements.',
  'web.pending': 'pending',
  'web.fromPreset': 'loaded from preset',
  'web.measuredLoaded': 'measured and loaded',
  'web.threadsCtx': '{threads} threads · {ctx} of context',
  'web.usesModel': 'Uses the model',
  'web.pendingCommands': 'To finish, run in a terminal (asks for the administrator password):',
  'web.error': 'error',
  'web.chatTitle': 'Test connection',
  'web.chatSubtitle': 'Send a prompt to test model response',
  'web.chatPlaceholder': 'Type a prompt to test…',
  'web.chatSend': 'Send',
  'web.chatThinking': 'Generating response…',
};

