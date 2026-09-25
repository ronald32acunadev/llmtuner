# LLM Tuner — especificación del proyecto

Documento de traspaso para continuar el proyecto en otra sesión o con otro agente de IA. Explica qué es, por qué existe, cómo funciona, qué se midió y qué falta. Última actualización: 2026-09-25.

---

## 1. La idea

Ejecutar un LLM local rápido depende de muchos parámetros que casi nadie ajusta bien: cuántas capas van a la GPU, cuánto contexto cabe, qué tipo de caché KV usar, en qué orden se usan varias GPUs, cuántos hilos de CPU… Los valores por defecto de LM Studio y Ollama suelen ser conservadores, y el usuario acaba con la CPU saturada y pocos tokens por segundo.

**LLM Tuner** automatiza ese ajuste. El usuario elige motor, modelo y contexto, y pulsa **Cargar**. La app encuentra la configuración más rápida para su hardware, la guarda como preset y carga el modelo con ella.

### Origen

El proyecto salió de un caso real. Qwen2.5-Coder-32B (Q4_K_M) en LM Studio sobre 2× RTX 5070 iba a ~11 t/s con la CPU saturada. Ajustándolo a mano se llegó a ~26 t/s. Ese proceso manual (buscar los archivos de config, descubrir que un límite de VRAM recortaba capas, medir qué contextos cabían) es lo que la app hace sola. Ver §8.

### Requisitos del usuario

1. **Ningún LLM decide la configuración.** Todo es determinista: detección de hardware, lectura de metadatos del modelo, fórmulas de memoria y mediciones reales. El único modelo que se ejecuta es el que se está configurando, y solo para medir su velocidad.
2. **Multiplataforma:** Windows, macOS y Linux, en Node.js.
3. **Dos motores:** LM Studio y Ollama. Si ya están instalados, se detectan; si no, se instalan automáticamente.
4. **Tres interfaces** sobre el mismo núcleo: CLI, web local y escritorio (Electron).
5. **Flujo de usuario** (definido por el usuario, respetarlo):
   1. Elegir motor (Ollama o LM Studio).
   2. La app lista los modelos ya descargados en ese motor.
   3. Elegir un modelo, escribir el contexto y pulsar **Cargar**.
   4. Si no existe preset: se ejecutan las pruebas para encontrar el mejor rendimiento para ese modelo y contexto.
   5. Se genera un **preset** para ese modelo y contexto, para no repetir las pruebas.
   6. **Solo se vuelve a medir cuando cambia el contexto** (o el hardware o el archivo del modelo).
6. La interfaz y los mensajes están en **español**. El código y los identificadores, en inglés.

---

## 2. Cómo se usa

```bash
npm install
npm start          # asistente CLI (src/cli/index.js)
npm run web        # interfaz web en http://127.0.0.1:7860
npm run desktop    # app de escritorio (electron/launch.js → electron/main.js)
npm test           # node --test test/
```

CLI no interactiva:

```bash
node src/cli/index.js --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --yes
node src/cli/index.js --presets
# otras opciones: --force (volver a medir), --dry-run, --candidates N, --json, --web
```

Requisitos: Node ≥ 20. Dependencias: `systeminformation` y `@inquirer/prompts`; `electron` como devDependency.

---

## 3. Arquitectura

```
src/
  core/                 núcleo compartido por las tres interfaces
    util.js             exec, which, JSON con copia de seguridad, fetch con timeout, muestreo de CPU
    hardware.js         CPU/RAM/GPU: nvidia-smi, rocm-smi, Apple Silicon, respaldo con systeminformation
    gguf.js             lector propio de GGUF (metadatos + tamaño de cada tensor) y resumen para el estimador
    estimator.js        memoria por capa, caché KV, reparto entre GPUs, predicción de t/s, candidatos
    benchmark.js        prompt de código sintético determinista; benchmark vía API (LM Studio / Ollama)
    llama-server.js     lanza el llama-server del backend de LM Studio con los parámetros exactos y mide
    presets.js          guardar y buscar presets; huella del hardware
    installer.js        planes de instalación oficiales por SO (winget, brew, scripts)
    tuner.js            orquestador: detectEngines, Tuner.plan/run/load, pickBest
    engines/
      lmstudio.js       detección, modelos, backend, escritura de config, apply, load
      ollama.js         detección, modelos, servidor privado para medir, Modelfile, variables, load
    index.js            exportaciones públicas
  cli/index.js          CLI con @inquirer/prompts
  web/server.js         http + SSE (/api/state, /api/models, /api/plan, /api/presets, /api/load, /api/install…)
  web/public/           index.html, app.js, style.css (vanilla, sin framework)
electron/
  launch.js             desactiva el sandbox de Chromium solo si chrome-sandbox no tiene setuid root
  main.js               arranca el servidor web en un puerto aleatorio y lo abre en una BrowserWindow
test/core.test.js       pruebas unitarias con los casos medidos como regresión
```

### Interfaz común de un motor (`engines/*.js`)

```
id, name, capabilities
detect()                              → { installed, bin, version, …}
listModels(ctx)                       → [{ key, name, sizeBytes, quant, … }]
modelMeta(ctx, key)                   → meta del GGUF (+ file)
prepare(ctx)                          → descarga los modelos cargados para liberar VRAM
benchmark(ctx, model, candidate, o)   → { ok, short, deep, cpu, vramPeakBytes, error, oom }
apply(ctx, model, candidate, o)       → escribe la config (dryRun devuelve la vista previa)
load(ctx, model, o)                   → carga el modelo con la config aplicada y mide un prompt corto
```

`ctx = { detection, hw }`.

### Flujo de `Tuner.load(model, ctx)`

1. `findPreset(engine, model, ctx, hw, modelBytes)`.
2. **Si hay preset:** evento `preset-hit` → `apply` (sin escribir si nada cambia) → `load`.
3. **Si no hay:** `run()`:
   1. `plan` con `unload`: descarga modelos y vuelve a leer la VRAM libre.
   2. Se prueban los N mejores candidatos (3 por defecto).
   3. `pickBest` → `savePreset` → evento `preset-saved` → `apply` → `load`.

Eventos de progreso: `status`, `plan`, `candidate-start`, `bench-progress`, `candidate-done`, `preset-hit`, `preset-saved`, `applied`, `loaded`, `done`. La web los recibe por SSE en `/api/jobs/:id/events`.

---

## 4. Algoritmos

### 4.1 Hardware (`hardware.js`)

- **NVIDIA:** `nvidia-smi --query-gpu=index,name,uuid,pci.bus_id,memory.total,memory.used,memory.free,pcie.link.gen.max,pcie.link.width.current,pcie.link.width.max,display_active`.
  - Usar **`width.current`**: `width.max` indica lo que soporta la GPU, no la ranura. En la máquina de referencia la GPU0 reporta max=16 y current=4.
  - Usar **`gen.max`**: `gen.current` baja a 1 cuando la GPU está en reposo.
- **Orden de prioridad de las GPUs:** mayor ancho de banda PCIe → sin monitor conectado → más VRAM libre.
- **Ancho de banda de memoria:** tabla por nombre de GPU. Solo se usa para ordenar candidatos antes de medir.
- **Apple Silicon:** VRAM utilizable ≈ 67 % de la RAM (≤ 36 GB) o 75 % (más de 36 GB).

### 4.2 GGUF (`gguf.js`)

Parser propio: lee el encabezado, los pares clave/valor y la info de tensores. Los arrays grandes (el vocabulario) se saltan y solo se guarda su longitud. A partir de los tensores obtiene:

- `layerBytes[i]`: bytes reales por capa `blk.i.*`.
- `layerExpertBytes[i]`: tensores `*_exps.*` (MoE).
- `attnLayers`: capas con `attn_k`/`attn_q`/`attn_qkv`. Los modelos híbridos (Mamba/SSM) solo tienen caché KV en esas capas.
- `outputBytes`: `output.weight` + normalización. Si los embeddings están atados, se suma `token_embd`.
- `kvHeadsPerLayer` (acepta arrays por capa), `slidingWindow` y `swaLayers`.
- Expertos (`expert_count` / `expert_used_count`).

Tarda unos 0.3 s en un GGUF de 19 GB.

### 4.3 Estimador (`estimator.js`)

**Caché KV por capa** = `tokens × cabezasKV × (key_len + value_len) × bytes_por_elemento`. Los bytes por elemento son f16 = 2, q8_0 = 34/32 y q4_0 = 18/32. En capas SWA, `tokens = min(ctx, ventana)`.
Validado: 32K con q8_0 en Qwen 32B = 4352 MiB, exactamente lo que asigna llama.cpp.

**Constantes calibradas** en 2× RTX 5070 con Qwen2.5-Coder-32B:

| Constante | Valor | Nota |
|---|---|---|
| `PER_GPU_OVERHEAD` | 350 MiB | contexto CUDA + scratch |
| `PER_GPU_RESERVE` | 64 MiB | el "free" de `nvidia-smi` ya descuenta ~450 MiB del driver; **no restar otra reserva grande** (fue un bug) |
| `COMPUTE_BYTES_PER_CTX_TOKEN` | 3.5 KiB | |
| Buffer de logits | `vocab × ubatch × 4` | en la GPU que tiene la capa de salida (~297 MiB en Qwen) |
| `DECODE_EFFICIENCY` | 0.7 | fracción del ancho de banda teórico |
| `readCost` de q4_0 | ×12 | la caché q4_0 con Flash Attention es mucho más lenta de leer con contexto largo (medido) |

**Reparto de capas (`placeLayers`):**

1. Se cuenta cuántas capas caben, empezando por las **últimas** (llama.cpp descarga las últimas N).
2. La capa de salida más los logits van a la GPU prioritaria.
3. Si cabe todo y hay más de una GPU, se **reequilibra** para que todas las GPUs queden con el mismo porcentaje de margen libre. El reparto voraz dejaba la GPU prioritaria a ~90 MiB del límite y llama.cpp fallaba al asignar los buffers de cálculo (bug real, ya corregido).
4. En modelos MoE que no caben, se prueba dejar en la RAM los expertos de las primeras N capas (`--n-cpu-moe`).

**Candidatos (`planCandidates`):**

- Se calcula un reparto por cada tipo de KV (f16, q8_0, q4_0).
- Si a una opción le falta menos de 1 GiB para caber entera, se añade también un candidato **optimista** (probe) con todo en GPU. Si no cabe, falla rápido al cargar y se descarta.
- **Hilos:** 4 si todo va en GPU; núcleos físicos − 1 si hay capas en la CPU.
- **Orden:** primero los que caben enteros con seguridad, luego por t/s estimado × calidad del tipo de KV.

**Velocidad estimada:** tiempo por token = bytes leídos en cada GPU / (ancho de banda × 0.7) + bytes en CPU / (ancho de banda de RAM × 0.6) + lectura de la caché a la profundidad dada × `readCost`. Solo sirve para ordenar; decide la medición real.

**Elección final (`pickBest`):** máximo de `t/s con contexto × calidad_KV`, con calidad f16 = 1.0, q8_0 = 0.99 y q4_0 = 0.93.

### 4.4 Benchmark

- **Prompt:** código JavaScript sintético y determinista (PRNG con semilla fija). En llama-server los caracteres por token se calibran con `/tokenize`.
- **Dos mediciones:** un prompt corto (~200 tokens) y uno largo (~50 % del contexto). Se generan 200 tokens con `ignore_eos` para que la longitud sea fija.
- **Muestreo cada 500 ms:** VRAM con `nvidia-smi` y CPU con `os.cpus()`, que funciona en todos los sistemas.
- **Detección de OOM** en el log (`cudaMalloc failed`, `out of memory`…). Si falla, se devuelven las últimas 15 líneas del log en `logTail`.

---

## 5. Integración con los motores

### 5.1 LM Studio (verificado con 0.4.25 en Linux)

| Qué | Dónde |
|---|---|
| Carpeta base | `~/.lmstudio` (o la ruta de `~/.lmstudio-home-pointer`) |
| CLI | `~/.lmstudio/bin/lms` (`lms ls --json`, `lms load`, `lms unload --all`, `lms server start`, `lms ps`) |
| Índice de modelos | `.internal/model-index-cache.json`. Un modelo "virtual" (`qwen/qwen2.5-coder-32b`) apunta con `concreteModelIndexedModelIdentifier` a la entrada concreta, que tiene `containingDirAbsolutePath` |
| Config por modelo | `.internal/user-concrete-model-default-config/<clave>.json` |
| Config de hardware | `.internal/hardware-config.json` (formato superjson: `{"json":[["<backend>",{"fields":[…]}]],"meta":{"values":["map"]}}`) |
| Backend activo | `.internal/backend-preferences-v1.json` → `extensions/backends/<nombre>-<versión>/llama-server`. Librerías CUDA en `extensions/backends/vendor/*` |
| Ruta de la app | `.internal/app-install-location.json` |
| API | `http://127.0.0.1:1234/api/v0/chat/completions` (devuelve `stats.tokens_per_second`) |

**Claves de la config por modelo** (`load.fields`):

- `llm.load.contextLength`
- `llm.load.llama.acceleration.offloadRatio` (1 = todo en GPU)
- `llm.load.llama.flashAttention`
- `llm.load.llama.cpuThreadPoolSize`
- `llm.load.llama.evalBatchSize` y `llm.load.llama.physicalBatchSize`
- `llm.load.numParallelSessions`
- `llm.load.useUnifiedKvCache`
- `llm.load.offloadKVCacheToGpu`
- `llm.load.llama.kCacheQuantizationType` / `vCacheQuantizationType`, con formato `{checked, value}`
- `llm.load.llama.contextCheckpoints`
- `llm.load.numCpuExpertLayersRatio` (MoE)

**Claves de la config de hardware:**

- `load.gpuStrictVramCap`: es la opción "Limit Model Offload to Dedicated GPU Memory".
- `load.gpuSplitConfig`: `{strategy: "priorityOrder" | "evenly" | "tensor", priority: [1,0], disabledGpus, customRatio}`.

**Comportamientos verificados:**

- **`gpuStrictVramCap: true` recorta capas por su cuenta,** con una estimación conservadora: 59 de 65 en Qwen 32B, incluso con `lms load --gpu max`. La app lo pone a `false` solo cuando el benchmark confirmó que todo cabe.
- **LM Studio vuelve a leer la config por modelo en cada `lms load`.** Se puede escribir con la app abierta.
- **`hardware-config.json` se escribe con la app cerrada,** porque puede sobrescribirlo al salir. La app solo se reinicia si esa config cambia (`isHardwareApplied`). El cierre usa SIGINT y, si hace falta, SIGKILL, porque Electron se queda en la bandeja del sistema.
- **Los argumentos reales** con los que se lanzó llama-server se pueden ver en `/proc/<pid>/cmdline` (Linux). Así se descubrió el `--n-gpu-layers 59`.
- **El benchmark usa directamente el `llama-server` del backend de LM Studio,** que es el mismo binario, así que los resultados se trasladan tal cual.
- **Orden de dispositivos CUDA** en el benchmark:
  - `CUDA_DEVICE_ORDER=PCI_BUS_ID`, para que coincida con la numeración de `nvidia-smi`.
  - `CUDA_VISIBLE_DEVICES` con la prioridad invertida, porque llama.cpp da las últimas capas y la de salida al último dispositivo.
  - `--tensor-split` con el número de capas por GPU, en ese mismo orden invertido.
- **LM Studio actualiza su backend solo.** Durante el desarrollo pasó de 2.45.0 a 2.46.0. `backend()` lee las preferencias y, si no existen, usa el más reciente.

### 5.2 Ollama (implementado, sin probar con Ollama instalado)

- **API:** `OLLAMA_HOST` o `127.0.0.1:11434`. Endpoints `/api/tags`, `/api/show` (`verbose: true` da `model_info`; el campo `modelfile` contiene `FROM <ruta del blob>`, que se lee como GGUF), `/api/generate` y `/api/ps` (`size_vram` frente a `size` para saber cuánto quedó realmente en GPU).
- **El tipo de KV y Flash Attention son globales del servidor** (`OLLAMA_KV_CACHE_TYPE`, `OLLAMA_FLASH_ATTENTION`). Por eso cada candidato se mide en un **`ollama serve` privado** en otro puerto, con `OLLAMA_MODELS` apuntando a los mismos modelos. Si no se puede leer la carpeta de modelos (servicio systemd), se mide en el servidor principal y se avisa.
- **Aplicar:**
  - `ollama create <modelo>:<tag>-tuned-<N>k` con un Modelfile (`num_ctx`, `num_gpu`, `num_thread`, `num_batch`).
  - Variables del servidor: override de systemd en Linux (necesita sudo; si no hay sudo sin contraseña, se muestran los comandos), `setx` en Windows y `launchctl setenv` en macOS.
- **Cargar:** `generate` con `keep_alive: '30m'` sobre el modelo ajustado.

### 5.3 Instalación automática (`installer.js`)

| Motor | Linux | macOS | Windows |
|---|---|---|---|
| Ollama | `curl -fsSL https://ollama.com/install.sh \| sh` (pide sudo) | `brew install --cask ollama` o descarga del `.dmg` | `winget install Ollama.Ollama` o `irm https://ollama.com/install.ps1 \| iex` |
| LM Studio | `curl -fsSL https://lmstudio.ai/install.sh \| bash` (instala `llmster` sin interfaz, sin sudo) | lo mismo, o `brew install --cask lm-studio` | `winget install ElementLabs.LMStudio` o `irm https://lmstudio.ai/install.ps1 \| iex` |
| App LM Studio (descarga) | `https://lmstudio.ai/download/latest/<linux\|darwin\|win32>/<x64\|arm64>` | | |

Todas las URLs se verificaron el 2026-09-25. Los planes que piden sudo no se ejecutan desde la web (no hay terminal para la contraseña): se muestra el comando para ejecutarlo a mano.

---

## 6. Presets (`presets.js`)

- **Ruta:** `~/.config/llm-tuner/presets/` en Linux, `~/Library/Application Support/llm-tuner/presets/` en macOS y `%APPDATA%\llm-tuner\presets\` en Windows.
- **Archivo:** `<motor>__<modelo>__<ctx>.json` con `{version, engine, model, ctx, modelBytes, fingerprint, hardware, createdAt, candidate, bench, tried[]}`.
- **Huella del hardware:** sha256 de la marca de CPU + (nombre de GPU, VRAM en GB, generación y ancho PCIe) de cada GPU.
- **Se invalida si** cambia la huella o el tamaño del archivo del modelo. `--force` o la casilla "Volver a medir" lo ignoran.

---

## 7. Máquina de referencia

- **Sistema:** Ubuntu 26.04, kernel 7.0.
- **CPU y RAM:** AMD Ryzen 7 5800X (8 núcleos / 16 hilos), 76 GB de RAM.
- **GPU1:** RTX 5070 12 GB, PCIe 3.0 x16, sin monitor. Es la **prioritaria**.
- **GPU0:** RTX 5070 12 GB, PCIe 2.0 x4, con el monitor (~900 MiB ocupados por el escritorio).
- **Software:** LM Studio 0.4.25 con backend llama.cpp CUDA 12 (2.45 → 2.46). Node 26.10 y npm 11.19.
- **Almacenamiento:** el proyecto está en ext4 (`~/Proyects/llm-tuner`). Los modelos siguen en un disco **NTFS** (`/run/media/pumba/Proyects/Data/Models`). La primera copia del proyecto estaba en ese disco NTFS y desapareció el 2026-09-25 sin subirse a GitHub; se reconstruyó a partir del registro de la sesión.

## 8. Mediciones reales (Qwen2.5-Coder-32B Q4_K_M, 2× RTX 5070)

| Configuración | ¿Cabe? | Prompt corto | Con ~10K tokens | Con ~20K tokens | VRAM pico (GPU0 / GPU1) |
|---|---|---|---|---|---|
| Original (LM Studio con límite estricto, 59/65 capas) | — | 11–12.5 t/s | — | — | 9.8 / 9.6 GB |
| 8K q8_0, todo en GPU | ✅ | 26.0 | — | — | 10.6 / 10.9 GB |
| **16K q8_0, todo en GPU** (preset elegido) | ✅ | 25.6–26.1 | 22.2–22.8 | — | 11.1 / 11.5 GB |
| 20K q8_0 | ✅ al límite | — | 22.2 | — | 11.7 / 11.4 GB |
| 24K q8_0 | ❌ OOM | | | | |
| 32K q8_0 / K q8 + V q4 | ❌ OOM | | | | |
| 32K q4_0 | ✅ al límite | 23.8 | 15.5 | 11.4 | 11.7 / 11.5 GB |
| 16K f16, 62/65 capas | parcial | 16.7 | 14.0 | — | 11.4 / 11.4 GB |

Conclusiones:
- **Lo que más importa** es tener todas las capas en GPU: la velocidad pasó de 12.5 a 26 t/s y la CPU bajó del ~280 % a ~8 %.
- **Evitar q4_0 en la caché KV:** cabe más contexto, pero con contexto largo la velocidad se desploma.
- **16K es lo recomendado** para programar en esta máquina.

Tiempos de la app: la primera carga (medición de 3 candidatos + preset + carga) tarda 2 min 27 s. Con preset, 22 s.

---

## 9. Problemas conocidos y soluciones

- **Instalar Electron con npm 11 y Node 26:**
  - npm 11 bloquea los scripts de instalación. `package.json` ya incluye `allowScripts: {"electron@38.8.6": true}`.
  - La extracción automática de Electron falla en silencio (solo crea `dist/locales`). Pasa tanto en NTFS como en ext4, así que no depende del disco. Solución: descomprimir `~/.cache/electron/*/electron-v*-linux-x64.zip` en `node_modules/electron/dist` y crear `node_modules/electron/path.txt` con el texto `electron`.
- **Sandbox de Electron en Linux:** `chrome-sandbox` necesita ser de root con modo 4755, imposible en NTFS. `electron/launch.js` pone `ELECTRON_DISABLE_SANDBOX=1` solo en ese caso. Hacerlo con `app.commandLine.appendSwitch('no-sandbox')` **no funciona**: el sandbox se comprueba antes de que corra el main.
- **`pkill -f <patrón>` dentro de un script bash** se mata a sí mismo si el patrón aparece en la línea de comandos (código de salida 144). Usar `pgrep` y filtrar.
- **La VRAM "libre" de `nvidia-smi` ya descuenta la reserva del driver** (~450 MiB por GPU).
- **Para lanzar el `llama-server` de LM Studio a mano** hacen falta sus librerías: en Linux, `LD_LIBRARY_PATH=<backend>:<vendor/*>`; en Windows, `PATH`; en macOS, `DYLD_LIBRARY_PATH`.

---

## 10. Estado y próximos pasos

**Hecho y probado (Linux + NVIDIA + LM Studio):**
- Detección de hardware y motores.
- Lectura de GGUF.
- Estimador calibrado.
- Benchmark con llama-server.
- Presets.
- apply/load en LM Studio.
- CLI, web y Electron arrancando.
- 9 pruebas unitarias.

**Implementado pero sin probar:**
- Ollama de principio a fin.
- Windows y macOS: rutas, instaladores, `taskkill`, `osascript`, `setx`, `launchctl`.
- GPUs AMD (ROCm), Apple Silicon e Intel.
- Instalación automática real.

**Ideas y pendientes:**
1. Instalar Ollama en la máquina de referencia y probar el flujo completo (benchmark en servidor privado, Modelfile, override de systemd).
2. Probar en Windows y macOS.
3. Medir con un modelo MoE (Qwen3-Coder-30B-A3B ya está descargado) para validar `--n-cpu-moe` y las predicciones de modelos MoE.
4. Calibrar `readCost`/`PER_GPU_OVERHEAD` por familia de GPU. Hoy están calibrados solo en RTX 50xx.
5. Parámetro para elegir la profundidad del benchmark (hoy 50 % del contexto) y cantidad de candidatos desde la interfaz.
6. Empaquetar con electron-builder (la configuración ya está en `package.json`, `npm run dist`) y comprobar el sandbox en AppImage.
7. Detectar en la interfaz que un preset quedó obsoleto y explicar por qué (hardware o modelo) antes de volver a medir.
8. Mover presets entre máquinas iguales (exportar/importar).
9. Si LM Studio cambia sus formatos internos: detectar la versión y avisar en lugar de escribir a ciegas.

**Estado actual de la máquina de referencia:**
- LM Studio tiene configurado Qwen 32B con 16K, KV q8_0, todo en GPU y 4 hilos.
- En la config de hardware: `gpuStrictVramCap=false` y prioridad [1,0].
- Hay un preset guardado para `lmstudio / qwen/qwen2.5-coder-32b / 16384`.
- Las copias de seguridad de las configs originales están junto a cada archivo (`*.bak-20260925`, `*.bak-llm-tuner-*`).
