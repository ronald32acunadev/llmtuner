# LLM Tuner

[English](README.md) · **Español**

Carga un LLM local con la configuración más rápida para el contexto que necesitas, en LM Studio u Ollama, en Windows, macOS y Linux.

Ningún LLM decide la configuración. La app lee tu hardware y los metadatos del modelo, estima qué cabe en la VRAM, mide de verdad las mejores opciones y guarda la ganadora como **preset**. La próxima vez que cargues ese modelo con ese contexto se usa el preset directamente, sin volver a medir.

## Flujo

1. **Motor**: eliges LM Studio u Ollama. Si no está instalado, la app lo instala con el método oficial (winget, Homebrew o el script de instalación).
2. **Modelo y contexto**: eliges uno de tus modelos y escribes el contexto que quieres.
3. **Cargar**:
   - Si hay un preset para ese modelo, contexto y hardware, se aplica y se carga el modelo (unos 20 s).
   - Si no lo hay, se prueban 3 configuraciones (2–3 min), se guarda la mejor como preset, se aplica y se carga.

Solo se vuelve a medir cuando cambias el contexto, cambia el hardware (GPU, VRAM, CPU o enlace PCIe) o cambia el archivo del modelo. También puedes forzarlo con «Volver a medir aunque exista un preset» o con `--force`.

## Uso

```bash
npm install
npm start               # asistente en la terminal
npm run web             # interfaz web en http://127.0.0.1:7860
npm run desktop         # app de escritorio (Electron)
```

Modo no interactivo:

```bash
node src/cli/index.js --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --yes
node src/cli/index.js --presets          # lista los presets guardados
node src/cli/index.js --help
node src/cli/index.js --lang <en|es>     # idioma de la interfaz; se guarda para la próxima vez
```

La web y la app de escritorio tienen un selector EN/ES en la barra lateral, y la elección se guarda en `llm-tuner/settings.json`, junto a los presets.

## Qué se prueba

Para cada tipo de caché KV (`f16`, `q8_0`, `q4_0`) el estimador calcula:

- **Memoria por capa**, leída del GGUF (tamaño real de cada tensor).
- **Caché de contexto** según capas con atención, cabezas KV, dimensión y ventana deslizante (SWA).
- **Reparto de capas entre GPUs**, con prioridad a la GPU con el enlace PCIe más ancho y sin monitor, y el margen libre igualado entre tarjetas.
- **En modelos MoE que no caben**, cuántas capas de expertos pueden quedarse en la RAM (`--n-cpu-moe`).
- **Velocidad esperada**, según el ancho de banda de memoria.

Las mejores opciones se miden con un prompt corto y otro que llena ~50 % del contexto. Gana la más rápida con contexto lleno, ponderada por la calidad del tipo de KV.

- **LM Studio**: se ejecuta el mismo `llama-server` que usa LM Studio con los parámetros exactos. El resultado se escribe en la config del modelo (`~/.lmstudio/.internal/user-concrete-model-default-config/…`) y en `hardware-config.json`. LM Studio solo se reinicia si cambia la config de hardware.
- **Ollama**: cada opción se mide en un `ollama serve` privado en otro puerto, porque el tipo de KV y Flash Attention son globales. Se crea el modelo `<modelo>-tuned-16k` con `num_ctx`, `num_gpu` y `num_thread`, y se configuran las variables del servidor (systemd en Linux, `setx` en Windows, `launchctl` en macOS).

Antes de modificar cualquier archivo se guarda una copia `*.bak-llm-tuner-*`.

## Dónde se guardan los presets

- Linux: `~/.config/llm-tuner/presets/`
- macOS: `~/Library/Application Support/llm-tuner/presets/`
- Windows: `%APPDATA%\llm-tuner\presets\`

## Estado por plataforma

| | Probado | Notas |
|---|---|---|
| Linux + NVIDIA + LM Studio | ✅ 2× RTX 5070, Ryzen 7 5800X | Calibrado con mediciones reales |
| Linux + Ollama | Pruebas unitarias | Falta probarlo con Ollama instalado |
| Windows / macOS | Sin probar | Rutas, instaladores y detección implementados |
| AMD (ROCm) / Apple Silicon / Intel | Sin probar | Detección de VRAM incluida; ancho de banda por tabla |

## Pruebas

```bash
npm test
```

Incluye como regresión los resultados reales de 2× RTX 5070 con Qwen2.5-Coder-32B: 16K y 20K con q8_0 caben enteros, 24K no; 32K cabe solo con q4_0.

## Notas

- Con npm 11 y Node 26, la instalación de Electron puede terminar sin extraer el binario (en `node_modules/electron/dist` solo queda `locales`). En ese caso, extrae `~/.cache/electron/*/electron-*.zip` en `node_modules/electron/dist` y crea `node_modules/electron/path.txt` con el texto `electron`. `npm run desktop` desactiva el sandbox de Chromium solo cuando no puede funcionar (no hay `chrome-sandbox` con setuid de root).
- Los archivos internos de LM Studio no son una API pública. Esta versión está verificada con LM Studio 0.4.25.
