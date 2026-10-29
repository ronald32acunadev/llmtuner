# LLM Tuner

[English](README.md) · **Español**

[![npm version](https://img.shields.io/npm/v/llm-tuner.svg)](https://www.npmjs.com/package/llm-tuner)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

Carga un LLM local con la configuración más rápida para el contexto que necesitas, en LM Studio u Ollama, en Windows, macOS y Linux. Tú eliges qué significa «mejor» mediante perfiles de carga deterministas: velocidad pura (`speed`), equilibrio (`balanced`) o máxima calidad de respuestas (`quality`).

Ningún LLM decide la configuración. LLM Tuner lee la topología de tu hardware y los metadatos GGUF del modelo, calcula matemáticamente qué cabe en la VRAM, mide empíricamente las mejores configuraciones candidatas en hardware real y guarda la ganadora como un **preset** persistente. La próxima vez que cargues ese modelo con el mismo contexto y perfil, el preset se aplica de inmediato (~20 s) sin volver a medir.

---

## Tabla de contenidos

- [Características principales](#características-principales)
- [Cómo funciona](#cómo-funciona)
- [Perfiles de carga](#perfiles-de-carga)
- [Instalación](#instalación)
- [Uso](#uso)
  - [CLI interactiva y comandos slash](#cli-interactiva-y-comandos-slash)
  - [Aplicación de escritorio](#aplicación-de-escritorio)
  - [Modo servidor remoto y daemon](#modo-servidor-remoto-y-daemon)
  - [Integración MCP para agentes de IA](#integración-mcp-para-agentes-de-ia)
  - [Modo CLI no interactivo](#modo-cli-no-interactivo)
  - [Referencia de opciones y banderas CLI](#referencia-de-opciones-y-banderas-cli)
- [Flujo de ajuste y medición](#flujo-de-ajuste-y-medición)
- [Arquitectura y rutas de almacenamiento](#arquitectura-y-rutas-de-almacenamiento)
- [Soporte por plataforma](#soporte-por-plataforma)
- [Desarrollo y pruebas](#desarrollo-y-pruebas)
- [Solución de problemas y notas de plataforma](#solución-de-problemas-y-notas-de-plataforma)
- [Licencia](#licencia)

---

## Características principales

- **Optimización determinista**: Basada en metadatos de tensores GGUF, mediciones de ancho de banda PCIe y pruebas reales de generación de tokens, sin que ninguna IA adivine parámetros.
- **Detección multi-GPU y topología**: Reparte capas inteligentemente entre múltiples GPUs, priorizando las tarjetas con mayor enlace PCIe y sin monitor conectado.
- **Perfiles de carga a medida**: Optimiza para velocidad máxima (`speed`), velocidad ponderada por calidad (`balanced`) o retención íntegra en GPU sin pérdidas (`quality`).
- **Soporte de motores locales**: Compatibilidad directa con LM Studio (gestión de `llama-server`) y Ollama (servidores de prueba aislados e integración con servicios del sistema).
- **Presets persistentes**: Mide una sola vez por huella de hardware, modelo, contexto y perfil. Invalida automáticamente el preset si cambia el hardware o el archivo del modelo.
- **Doble interfaz**: Asistente interactivo en terminal (`llm-tuner`) e interfaz gráfica multiplataforma (`llm-tuner-desktop`).
- **Modo servidor remoto y daemon**: Ejecuta `llm-tuner /serve` en un servidor con GPUs dedicadas con autenticación Bearer segura (`timingSafeEqual`) y telemetría sanitizada, y contrólalo desde cualquier cliente CLI o de escritorio.
- **Integración MCP para agentes de IA**: Conecta tus motores locales o remotos (LM Studio, Ollama) como servidores Model Context Protocol (MCP) en Claude Desktop, Claude Code, OpenCode, Antigravity, VS Code y ChatGPT/Codex.
- **Bilingüe**: Localización completa en inglés (`en`) y español (`es`) tanto en terminal como en escritorio.

---

## Cómo funciona

1. **Selección de motor**: Eliges LM Studio u Ollama. Si ninguno está instalado, LLM Tuner ofrece planes de instalación oficiales.
2. **Modelo y contexto**: Seleccionas cualquiera de tus modelos descargados y defines la ventana de contexto deseada (entre `512` y el límite de entrenamiento del modelo, p. ej. `16384` tokens).
3. **Perfil de carga**: Eliges entre `speed`, `balanced` (predeterminado) o `quality`. El planificador recomienda el perfil de mayor calidad que cabe íntegramente en la VRAM libre.
4. **Carga y medición**:
   - **Con preset existente**: Si ya existe un preset válido para ese modelo, contexto, perfil y huella de hardware, se aplica y carga de inmediato (~20 s).
   - **Sin preset**: Descarga modelos previos para liberar VRAM, evalúa las configuraciones candidatas más prometedoras (2–3 min), mide la velocidad con contexto corto y profundo, guarda el preset ganador y carga el modelo.

Solo se vuelve a medir cuando cambias el contexto o el perfil, cambia el hardware (GPU, VRAM, enlace PCIe), cambia el archivo del modelo o cambian las variantes descargadas (en `speed` y `quality`). También puedes forzar la medición en cualquier momento con `--force`.

---

## Perfiles de carga

Más tokens por segundo no siempre equivale a mejores respuestas. Los perfiles de carga permiten decidir cuándo ceder calidad a cambio de velocidad o ahorro de memoria:

| Perfil | Objetivo de optimización | Comportamiento y compensaciones |
| :--- | :--- | :--- |
| `speed` | Máximos tokens por segundo. | Selecciona la variante descargada más ligera y permite cualquier tipo de caché KV (`f16`, `q8_0`, `q4_0`). |
| `balanced` | Velocidad ponderada por calidad de caché KV. *(Predeterminado)* | Utiliza la variante seleccionada y clasifica las candidatas según `tps × kvQuality`. |
| `quality` | Mínima pérdida ejecutándose por completo en GPU. | Elige la variante descargada más pesada que quepa al 100% en VRAM con caché KV precisa (`f16` o `q8_0`). Si ninguna cabe por completo en GPU, aplica la regla de `balanced`. |

Las optimizaciones sin pérdida (distribución de capas entre GPUs, orden de tarjetas, número de hilos de CPU) se aplican siempre en todos los perfiles.

### Selección de variantes

- **Ollama**: Selecciona y carga automáticamente la variante (etiqueta) óptima para el perfil activo entre las etiquetas identificadas como la misma familia de modelo.
- **LM Studio**: Optimiza la variante activa y te avisa si otra cuantización descargada (o descargable como `Q8_0`, `Q6_K` o `Q5_K_M`) se adapta mejor al perfil elegido.

---

## Instalación

Instalación global mediante npm:

```bash
npm install -g llm-tuner
```

O ejecución directa sin instalación permanente mediante `npx`:

```bash
npx llm-tuner
```

### Requisitos previos

- **Node.js**: `>= 22` (`engines.node` en [`package.json`](package.json)).
- **Motor local**: LM Studio (0.4.25+) u Ollama instalado (o instálalo mediante el asistente integrado).

---

## Uso

### CLI interactiva y comandos slash

Inicia el menú interactivo en la terminal:

```bash
llm-tuner
```

Ejecutar `llm-tuner` sin argumentos abre un bucle de menú interactivo:
- `/load`: Ajustar y cargar un modelo con la configuración óptima de hardware.
- `/mcp`: Conectar el motor local con agentes de programación de IA como servidor MCP.
- `/presets`: Ver los presets de configuración guardados.
- `/serve`: Iniciar en modo servidor remoto con autenticación de API.
- `/settings`: Configurar el idioma (`en` / `es`) y el tema visual (`system` / `light` / `dark`).
- `/help`: Ver la ayuda de uso y las opciones de la CLI.
- `/exit`: Salir del menú interactivo.

También puedes ejecutar cualquier comando slash (o su alias sin barra) directamente desde la terminal:

```bash
llm-tuner /load
llm-tuner /mcp
llm-tuner /presets
llm-tuner /serve
llm-tuner /settings
llm-tuner /help
```

### Aplicación de escritorio

Inicia la aplicación gráfica de escritorio:

```bash
llm-tuner-desktop
```

> [!NOTE]
> El entorno de ejecución de Electron se descarga en la primera ejecución si aún no está en caché. En Linux, `llm-tuner-desktop` también registra un acceso directo de escritorio en `~/.local/share/applications/llm-tuner.desktop`.

### Modo servidor remoto y daemon

Ejecuta LLM Tuner como un servicio de red en un equipo con GPUs dedicadas:

```bash
# Iniciar en 0.0.0.0:7860 por defecto (genera y guarda un token hexadecimal de 32 bytes si no se indica)
llm-tuner /serve

# Personalizar host, puerto y token Bearer
llm-tuner /serve --host 0.0.0.0 --port 7860 --token mi-token-secreto
```

- **Seguridad y sanitización de telemetría**: Las peticiones remotas o en modo servidor exigen el encabezado `Authorization: Bearer <token>` verificado mediante `crypto.timingSafeEqual`. Las respuestas remotas de `/api/state` omiten datos identificativos del host (distribución de SO, modelo exacto de CPU, IDs de bus PCI, UUIDs de GPU) y bloquean llamadas remotas a `/api/install` (`403 Forbidden`).
- **Conexión desde clientes**: Agrega el servidor remoto (Nombre, URL, Token) en la interfaz de escritorio/web desde **Configuración → Servidores**, o selecciona un servidor guardado desde la CLI con `--server <id|nombre>`.

### Integración MCP para agentes de IA

Registra LM Studio (`@mzxrai/mcp-openai`) u Ollama (`ollama-mcp-server`) en tus agentes de programación de IA:

```bash
# Asistente interactivo
llm-tuner /mcp

# Con opciones por línea de comandos
llm-tuner /mcp --engine lmstudio --name mi-llm-local --host http://127.0.0.1:1234/v1 --apiKey sk-lm-local
```

Agentes de IA compatibles:
- **Claude Desktop** (`claude_desktop_config.json`)
- **Claude Code** (`~/.claude.json`)
- **OpenCode** (`opencode.json`)
- **Antigravity** (`~/.gemini/config/mcp_config.json`)
- **VS Code** (`Code/User/mcp.json`)
- **ChatGPT / Codex** (`~/.codex/config.toml`)

### Modo CLI no interactivo

Ejecución directa en scripts, automatizaciones o entornos sin interfaz:

```bash
# Ajustar y cargar sin confirmaciones con el perfil balanced predeterminado
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --yes

# Optimizar para máxima calidad de respuesta con salida en JSON
llm-tuner --engine ollama --model qwen2.5-coder:14b --ctx 32768 --profile quality --yes --json

# Medir en modo simulación (--dry-run) sin modificar archivos ni guardar preset
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --dry-run

# Ejecutar contra un servidor remoto configurado
llm-tuner --server gpu-rig --engine ollama --model llama3.1:8b --ctx 16384 --yes
```

### Referencia de opciones y banderas CLI

| Opción / Comando | Descripción | Valor predeterminado |
| :--- | :--- | :--- |
| `/load`, `load` | Ajustar y cargar un modelo con la configuración óptima. | Predeterminado al pasar opciones de ajuste |
| `/mcp`, `mcp` | Configurar LM Studio u Ollama como servidor MCP en agentes de IA. | — |
| `/presets`, `presets`, `--presets` | Listar los presets guardados (filtrable con `--engine` y `--model`). | — |
| `/serve`, `serve`, `--serve` | Iniciar el modo daemon de servidor remoto con autenticación Bearer. | — |
| `/settings`, `settings`, `--settings` | Abrir el menú interactivo de configuración (idioma y tema). | — |
| `/help`, `help`, `-h`, `--help` | Mostrar la ayuda de uso y la ruta del directorio de presets. | — |
| `-v`, `--version` | Mostrar la versión instalada (`0.4.4`). | — |
| `--engine <lmstudio\|ollama>` | Motor local objetivo. | Preguntado interactivamente |
| `--model <clave>` | Clave del modelo (LM Studio) o etiqueta (Ollama). | Preguntado interactivamente |
| `--ctx <tokens>` | Tamaño de contexto en tokens (p. ej. `16384` o `16k`). | Preguntado interactivamente |
| `--profile <speed\|balanced\|quality>` | Perfil de carga a optimizar. | `balanced` |
| `--force` | Volver a medir aunque exista un preset válido. | `false` |
| `--candidates <n>` | Número de configuraciones candidatas a probar al medir. | `3` |
| `--yes` | No pedir confirmación interactiva. | `false` |
| `--dry-run` | Medir y mostrar cambios sin aplicar nada ni guardar preset. | `false` |
| `--json` | Emitir el resultado final en formato JSON. | `false` |
| `--lang <en\|es>` | Establecer y guardar el idioma de la interfaz. | Configuración guardada / `en` |
| `--theme <system\|light\|dark>` | Establecer y guardar el tema visual. | `system` |
| `--server <id\|nombre>` | Seleccionar el servidor activo desde la configuración guardada. | `local` |
| `--host <host>` | Dirección de escucha para `/serve` o URL de host para `/mcp`. | `0.0.0.0` (`/serve`) |
| `--port <puerto>` | Puerto TCP para `/serve`. | `7860` |
| `--token <token>` | Token Bearer de autenticación para `/serve`. | Hexadecimal autogenerado de 32 bytes |
| `--name <nombre>` | Nombre personalizado del servidor MCP al usar `/mcp`. | ID del motor (`lmstudio` / `ollama`) |
| `--apiKey <clave>` | Clave API personalizada para LM Studio al usar `/mcp`. | `sk-lm-local` |

---

## Flujo de ajuste y medición

Para cada tipo de caché KV permitido por el perfil activo (`f16`, `q8_0`, `q4_0`):

1. **Inspección de tensores GGUF**: Lee directamente las cabeceras de tensores GGUF para obtener el tamaño exacto en bytes por capa, embeddings y cabezal de salida.
2. **Modelado de memoria de contexto**: Calcula el consumo de caché KV considerando cabezas de atención, dimensiones y capas de ventana deslizante (SWA).
3. **Reparto de capas multi-GPU**: Distribuye las capas proporcionalmente al margen de VRAM disponible, ordenando las GPUs por generación/ancho PCIe y penalizando las tarjetas con pantalla conectada.
4. **Descarga de expertos MoE**: En arquitecturas Mixture-of-Experts (MoE) que superan la VRAM, calcula cuántas capas de expertos pueden alojarse en la RAM del sistema (`cpuMoeLayers` / `--n-cpu-moe`).
5. **Medición empírica**: Mide la velocidad de generación con un prompt corto y un prompt profundo (~50% del contexto objetivo), registrando uso de CPU y pico de VRAM.
6. **Aplicación atómica y copias de seguridad**:
   - **LM Studio**: Escribe la configuración por modelo en `~/.lmstudio/.internal/user-concrete-model-default-config/` y actualiza `hardware-config.json`.
   - **Ollama**: Crea un modelo ajustado (`<modelo>-tuned-<ctx>`) con `num_ctx`, `num_gpu` y `num_thread` fijados, y configura las variables de entorno del servicio (`OLLAMA_FLASH_ATTENTION`, `OLLAMA_KV_CACHE_TYPE`). Siempre se crea un respaldo con marca de tiempo (`*.bak-llm-tuner-*`) antes de modificar archivos.

---

## Arquitectura y rutas de almacenamiento

### Estructura del repositorio

```text
llmtuner/
├── src/
│   ├── cli/                # Enrutador CLI, asistente interactivo y comandos slash
│   │   ├── commands/       # /load, /mcp, /presets, /serve, /settings, /help
│   │   ├── animation.js    # Animación de progreso y telemetría en vivo en terminal
│   │   ├── colors.js       # Estilos ANSI adaptados al tema
│   │   ├── index.js        # Punto de entrada del binario CLI (llm-tuner)
│   │   ├── nav.js          # Navegación hacia atrás con Backspace/Escape
│   │   ├── profile.js      # Utilidades de selección de perfil en CLI
│   │   └── router.js       # Parser de argumentos y bucle del menú interactivo
│   ├── core/               # Detección de hardware, parser GGUF, estimador, presets y MCP
│   │   ├── engines/        # Adaptadores para LM Studio y Ollama
│   │   ├── mcp/            # Registro multiagente MCP y adaptadores JSON/TOML
│   │   ├── benchmark.js    # Ejecutor de pruebas de contexto corto y profundo
│   │   ├── client.js       # Cliente HTTP/SSE unificado (TunerApiClient)
│   │   ├── estimator.js    # Modelado matemático de VRAM y caché KV
│   │   ├── gguf.js         # Lector binario de cabeceras y tensores GGUF
│   │   ├── hardware.js     # Detección de topología de GPU, PCIe, RAM y CPU
│   │   ├── installer.js    # Planes de instalación multiplataforma de motores
│   │   ├── llama-server.js # Arnés directo de llama-server para pruebas de LM Studio
│   │   ├── presets.js      # Almacenamiento de presets con huella de hardware
│   │   ├── profiles.js     # Reglas de los perfiles speed, balanced y quality
│   │   ├── settings.js     # Preferencias persistentes y perfiles de servidores
│   │   ├── telemetry.js    # Muestreo en vivo de CPU, RAM y VRAM de GPU
│   │   ├── tuner.js        # Clase orquestadora principal (Tuner)
│   │   └── updater.js      # Comprobación de actualizaciones en el registro npm
│   ├── i18n/               # Catálogos de localización en inglés (en.js) y español (es.js)
│   ├── platform/           # Autorización privilegiada del servicio Ollama (sudo/polkit)
│   └── web/                # Servidor HTTP + SSE embebido e interfaz gráfica web/escritorio
├── electron/               # Lanzador de escritorio (launch.js) y proceso principal de Electron
├── scripts/                # Scripts locales de utilidad y evaluación
├── test/                   # Suite de pruebas nativas de Node.js (test/*.test.js)
└── docs/                   # Especificaciones de diseño, historias de usuario e informes de evaluación
```

### Rutas de configuración y presets

Por defecto, las preferencias (`settings.json`), la configuración del servidor (`server.json`) y los presets (`presets/*.json`) se guardan en el directorio de configuración del usuario (modificable mediante la variable de entorno `LLM_TUNER_CONFIG_DIR`):

| Sistema operativo | Directorio base de configuración | Directorio de presets |
| :--- | :--- | :--- |
| **Linux** | `~/.config/llm-tuner/` (o `$XDG_CONFIG_HOME/llm-tuner/`) | `~/.config/llm-tuner/presets/` |
| **macOS** | `~/Library/Application Support/llm-tuner/` | `~/Library/Application Support/llm-tuner/presets/` |
| **Windows** | `%APPDATA%\llm-tuner\` | `%APPDATA%\llm-tuner\presets\` |

---

## Soporte por plataforma

| Plataforma y Motor | Estado | Notas |
| :--- | :--- | :--- |
| **Linux + NVIDIA + LM Studio** | Verificado | Calibrado con mediciones en hardware real (2× RTX 5070, Ryzen 7 5800X). |
| **Linux + Ollama** | Verificado | Probado con instancias aisladas de medición, overrides de systemd y pruebas unitarias. |
| **Windows / macOS** | Soportado | Rutas oficiales, planes de instalación, variables `setx`/`launchctl` y detección de GPU implementados. |
| **AMD ROCm / Apple Silicon / Intel Arc** | Soportado | Detección de VRAM y memoria unificada activa; ancho de banda estimado por tablas de arquitectura. |

---

## Desarrollo y pruebas

Clona el repositorio e instala las dependencias:

```bash
git clone https://github.com/ronald32acunadev/llmtuner.git
cd llmtuner
npm install

# Iniciar el asistente CLI
npm start

# Iniciar la aplicación de escritorio con Electron
npm run desktop

# Ejecutar la suite de pruebas automatizadas de Node.js
npm test
```

---

## Solución de problemas y notas de plataforma

- **Primera ejecución de escritorio (`llm-tuner-desktop`)**: El binario de Electron se descarga en la primera instalación/ejecución. Si la interfaz de escritorio no puede iniciarse, ejecuta `llm-tuner` en la terminal (funciona sin Electron).
- **Sandbox de Linux en particiones NTFS/exFAT o sin permisos SUID**: `electron/launch.js` comprueba automáticamente los permisos de `chrome-sandbox` en Linux y activa `ELECTRON_DISABLE_SANDBOX=1` cuando el binario no pertenece a root con modo `04755`.
- **Autorización del servicio Ollama**: Actualizar las variables de entorno del servicio Ollama (`OLLAMA_KV_CACHE_TYPE`, `OLLAMA_FLASH_ATTENTION`) en Linux puede solicitar autorización de administrador (`sudo` o `pkexec`). Si los ajustes no cambian, el servicio no se reinicia. El modo no interactivo (`--json`) nunca bloquea pidiendo contraseña.
- **Cerrar LM Studio antes de aplicar cambios**: LM Studio sobrescribe sus archivos de configuración al cerrarse; ciérralo antes de aplicar una nueva configuración de hardware si el asistente lo solicita.

---

## Licencia

Publicado bajo la [Licencia MIT](LICENSE).
