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
};
