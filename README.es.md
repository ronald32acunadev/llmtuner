# LLM Tuner

[English](README.md) · **Español**

Carga un LLM local con la mejor configuración para el contexto que necesitas, en LM Studio u Ollama, en Windows, macOS y Linux. Tú eliges qué significa «mejor» con un perfil de carga: velocidad, un equilibrio o calidad de las respuestas.

Ningún LLM decide la configuración. La app lee tu hardware y los metadatos del modelo, estima qué cabe en la VRAM, mide de verdad las mejores opciones y guarda la ganadora como **preset**. La próxima vez que cargues ese modelo con ese contexto y ese perfil se usa el preset directamente, sin volver a medir.

## Flujo

1. **Motor**: eliges LM Studio u Ollama. Si no está instalado, la app lo instala con el método oficial (winget, Homebrew o el script de instalación).
2. **Modelo y contexto**: eliges uno de tus modelos y escribes el contexto que quieres.
3. **Perfil**: eliges qué optimizar: `speed`, `balanced` o `quality`. La app marca uno como recomendado.
4. **Cargar**:
   - Si hay un preset para ese modelo, contexto, perfil y hardware, se aplica y se carga el modelo (unos 20 s).
   - Si no lo hay, se prueban 3 configuraciones (2–3 min), se guarda la mejor como preset, se aplica y se carga.

Solo se vuelve a medir cuando cambias el contexto o el perfil, cambia el hardware (GPU, VRAM, CPU o enlace PCIe) o cambia el archivo del modelo. Con `speed` y `quality` también se vuelve a medir cuando descargas o eliminas una variante del modelo. También puedes forzarlo con «Volver a medir aunque exista un preset» o con `--force`.

## Perfiles de carga

Más tokens por segundo no significa mejores respuestas. El perfil decide cuánta calidad de las respuestas se puede ceder a cambio de velocidad o memoria.

| Perfil | Qué optimiza | Qué cuesta |
|---|---|---|
| `speed` (Velocidad) | Los tokens por segundo. Usa la variante más ligera del modelo que tengas descargada y cualquier tipo de caché KV. | Calidad de las respuestas: se admiten los pesos y la caché más comprimidos. |
| `balanced` (Equilibrado) | La velocidad ponderada por la calidad de la caché KV, con la variante que has seleccionado. Es el perfil predeterminado. | Un término medio: ni el más rápido ni el más preciso. |
| `quality` (Calidad) | La menor pérdida que aún se ejecuta por completo en GPU: la variante descargada más pesada que cabe, con una caché KV precisa (`f16` o `q8_0`). | Velocidad. Si nada cabe por completo en GPU, lo indica y elige la ganadora como `balanced`. |

Las optimizaciones que no pierden nada (reparto de capas entre GPUs, orden de las GPUs, hilos) se aplican en todos los perfiles.

Antes de cargar, la app también te indica:

- **Qué perfil se recomienda**: el de mayor calidad que aún se ejecuta por completo en tus GPUs.
- **Si cabría una variante más pesada**: por ejemplo, que Q8_0 no está descargada y cabría por completo en tus GPUs. El tamaño es una estimación, y la app nunca descarga nada.
- **Si la vista previa es conservadora**: se calcula con la VRAM que está libre en ese momento, así que la app te avisa cuando la VRAM está en uso. Al cargar, primero se descargan de la memoria los modelos del motor y después se hace la elección real.

Los motores se diferencian en una cosa. **Ollama** permite que la app elija la variante (etiqueta) para el perfil y la cargue, entre las etiquetas que puede identificar como el mismo modelo. **LM Studio** no puede cargar una variante concreta a petición, así que ahí el perfil se aplica a la variante seleccionada en LM Studio, y la app te indica cuál seleccionar cuando otra se ajusta mejor al perfil.

## Instalación

```bash
npm install -g llm-tuner
llm-tuner               # asistente en la terminal
llm-tuner-desktop       # app de escritorio
```

Necesita Node.js 22 o posterior. La app de escritorio descarga su entorno de ejecución (Electron) la primera vez que ejecutas `llm-tuner-desktop`, así que esa primera ejecución necesita conexión a la red y tarda más. El asistente de terminal funciona sin él.

## Uso

Modo no interactivo:

```bash
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --yes
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --profile quality --yes
llm-tuner --presets          # lista los presets guardados
llm-tuner --help
llm-tuner --lang <en|es>     # idioma de la interfaz; se guarda para la próxima vez
```

`--profile <speed|balanced|quality>` establece el perfil de carga para esa ejecución. El asistente lo pregunta y recuerda tu elección. Sin la opción, una ejecución con `--yes`, con `--json` o con motor, modelo y contexto indicados usa `balanced`.

La app de escritorio tiene un selector EN/ES en la barra lateral, y la elección se guarda en `llm-tuner/settings.json`, junto a los presets. El perfil que eliges en el asistente o en la app también se guarda ahí.

## Qué se prueba

Para cada tipo de caché KV que admite el perfil (`f16`, `q8_0`, `q4_0`; `quality` excluye `q4_0`) el estimador calcula:

- **Memoria por capa**, leída del GGUF (tamaño real de cada tensor).
- **Caché de contexto** según capas con atención, cabezas KV, dimensión y ventana deslizante (SWA).
- **Reparto de capas entre GPUs**, con prioridad a la GPU con el enlace PCIe más ancho y sin monitor, y el margen libre igualado entre tarjetas.
- **En modelos MoE que no caben**, cuántas capas de expertos pueden quedarse en la RAM (`--n-cpu-moe`).
- **Velocidad esperada**, según el ancho de banda de memoria.

Las mejores opciones se miden con un prompt corto y otro que llena ~50 % del contexto. El perfil decide la ganadora: en `balanced`, la más rápida con contexto lleno, ponderada por la calidad del tipo de KV.

- **LM Studio**: se ejecuta el mismo `llama-server` que usa LM Studio con los parámetros exactos. El resultado se escribe en la config del modelo (`~/.lmstudio/.internal/user-concrete-model-default-config/…`) y en `hardware-config.json`. LM Studio solo se reinicia si cambia la config de hardware.
- **Ollama**: cada opción se mide en un `ollama serve` privado en otro puerto, porque el tipo de KV y Flash Attention son globales. Se crea el modelo `<modelo>-tuned-16k` con `num_ctx`, `num_gpu` y `num_thread`, y se configuran las variables del servidor (systemd en Linux, `setx` en Windows, `launchctl` en macOS).

Antes de modificar cualquier archivo se guarda una copia `*.bak-llm-tuner-*`.

## Dónde se guardan los presets

Hay un preset por motor, modelo, contexto y perfil.

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

Los perfiles de carga están cubiertos por pruebas unitarias y se comprobaron con una carga real por perfil en LM Studio (Linux, 2× RTX 5070). La elección entre varias variantes descargadas de un modelo, y los perfiles en Ollama, aún no se han probado en hardware real.

## Desarrollo

```bash
git clone https://github.com/ronald32acunadev/llmtuner.git
cd llmtuner
npm install
npm start               # asistente en la terminal
npm run desktop         # app de escritorio
```

## Pruebas

```bash
npm test
```

Incluye como regresión los resultados reales de 2× RTX 5070 con Qwen2.5-Coder-32B: 16K y 20K con q8_0 caben enteros, 24K no; 32K cabe solo con q4_0.

## Notas

- Electron no se descarga al instalar el paquete: lo descarga la primera ejecución de la app de escritorio. Si esa descarga falla, extrae `~/.cache/electron/*/electron-*.zip` en la carpeta `dist` del paquete `electron` instalado y crea `path.txt` junto a ella con el texto `electron`. La app de escritorio desactiva el sandbox de Chromium solo cuando no puede funcionar (no hay `chrome-sandbox` con setuid de root).
- Los archivos internos de LM Studio no son una API pública. Esta versión está verificada con LM Studio 0.4.25.
