# LLM Tuner

[English](README.md) · **Español**

[![npm version](https://img.shields.io/npm/v/llm-tuner.svg)](https://www.npmjs.com/package/llm-tuner)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

Carga un LLM local con la mejor configuración para el contexto que necesitas, en LM Studio u Ollama, en Windows, macOS y Linux. Tú eliges qué significa «mejor» mediante perfiles de carga deterministas: velocidad, equilibrio o máxima calidad de respuestas.

Ningún LLM decide la configuración. LLM Tuner lee la topología de tu hardware y los metadatos GGUF del modelo, calcula matemáticamente qué cabe en la VRAM, mide empíricamente las mejores configuraciones candidatas en hardware real y guarda la ganadora como un **preset** persistente. La próxima vez que cargues ese modelo con ese contexto y perfil, el preset se aplica directamente (en ~20 s) sin volver a medir.

---

## Tabla de contenidos

- [Características](#características)
- [Cómo funciona](#cómo-funciona)
- [Perfiles de carga](#perfiles-de-carga)
- [Instalación](#instalación)
- [Uso](#uso)
  - [Asistente interactivo](#asistente-interactivo)
  - [Aplicación de escritorio](#aplicación-de-escritorio)
  - [Modo CLI no interactivo](#modo-cli-no-interactivo)
  - [Referencia de opciones CLI](#referencia-de-opciones-cli)
- [Qué se prueba](#qué-se-prueba)
- [Dónde se guardan los presets](#dónde-se-guardan-los-presets)
- [Estado por plataforma](#estado-por-plataforma)
- [Arquitectura del proyecto](#arquitectura-del-proyecto)
- [Desarrollo y pruebas](#desarrollo-y-pruebas)
- [Notas y solución de problemas](#notas-y-solución-de-problemas)
- [Licencia](#licencia)

---

## Características

- **Optimización determinista**: Basada en metadatos reales de tensores GGUF, ancho de banda PCIe y pruebas empíricas de velocidad de generación, sin que ninguna IA adivine parámetros.
- **Detección multitarjeta y topología**: Reparte capas inteligentemente priorizando la GPU con mayor enlace PCIe y sin monitor conectado.
- **Perfiles de carga a medida**: Optimiza para velocidad pura (`speed`), equilibrio ponderado por calidad (`balanced`) o retención íntegra en GPU sin pérdidas (`quality`).
- **Soporte de motores locales**: Compatibilidad directa con LM Studio (a través de `llama-server`) y Ollama (instancias privadas aisladas).
- **Presets persistentes**: Mide una única vez por combinación de hardware, modelo, contexto y perfil. Invalida presets automáticamente si el hardware o el archivo del modelo cambian.
- **Doble interfaz**: Asistente en consola (`llm-tuner`) y aplicación gráfica de escritorio (`llm-tuner-desktop`).
- **Integración MCP para agentes de IA**: Conecta tus motores locales (LM Studio, Ollama) como servidores Model Context Protocol (MCP) en Claude Desktop, Claude Code, OpenCode, Antigravity, VS Code y ChatGPT/Codex con nombres personalizados y seguridad multiplataforma.
- **Bilingüe**: Localización completa en español e inglés tanto en terminal como en entorno gráfico.

---

## Cómo funciona

1. **Motor**: Eliges LM Studio u Ollama. Si no está instalado, la app ofrece planes de instalación oficiales.
2. **Modelo y contexto**: Eliges uno de tus modelos descargados y defines el tamaño de contexto deseado (p. ej. 16.384 tokens).
3. **Perfil de carga**: Eliges qué optimizar: `speed`, `balanced` (predeterminado) o `quality`. La app resalta una recomendación según la VRAM libre.
4. **Cargar**:
   - **Preset existente**: Si ya existe un preset para ese modelo, contexto, perfil y hardware, se aplica de inmediato y se carga el modelo (~20 s).
   - **Sin preset**: Descarga modelos previos para liberar VRAM, prueba las configuraciones más prometedoras (2–3 min), guarda la mejor como preset y carga el modelo.

Solo se vuelve a medir cuando cambias el contexto o el perfil, cambia el hardware (GPU, VRAM, PCIe), cambia el archivo del modelo o se modifican las variantes descargadas (en `speed` y `quality`). También puedes forzar una nueva medición con `--force`.

---

## Perfiles de carga

Más tokens por segundo no siempre significa mejores respuestas. El perfil decide cuánta calidad de respuestas se puede ceder a cambio de velocidad o memoria:

| Perfil | Qué optimiza | Comportamiento y compensaciones |
|---|---|---|
| `speed` (Velocidad) | Tokens por segundo al máximo. | Usa la variante descargada más ligera y cualquier tipo de caché KV (incluyendo `q4_0`). |
| `balanced` (Equilibrado) | Velocidad ponderada por calidad de caché KV. *(Predeterminado)* | Término medio: usa la variante seleccionada y pondera la velocidad según la precisión de la caché. |
| `quality` (Calidad) | Mínima pérdida que aún se ejecuta por completo en GPU. | Elige la variante descargada más pesada que quepa en VRAM con caché KV precisa (`f16` o `q8_0`). Si nada cabe completo en GPU, recurre a la regla de `balanced`. |

Las optimizaciones sin pérdida (reparto de capas entre GPUs, orden de tarjetas, hilos de CPU) se aplican siempre en todos los perfiles.

### Selección de variantes

- **Ollama**: La app puede elegir automáticamente la variante (etiqueta) óptima para el perfil y cargarla entre las etiquetas que reconozca como el mismo modelo.
- **LM Studio**: Dado que LM Studio no permite seleccionar variantes por API externa, la app optimiza la variante activa y te avisa cuando otra variante se ajusta mejor al perfil seleccionado.

---

## Instalación

Instalación global vía npm:

```bash
npm install -g llm-tuner
```

Requisitos previos:
- **Node.js**: versión 22 o posterior (`node >= 22`).
- **Motor local**: LM Studio (0.4.25+) u Ollama instalado (o instalarlo mediante las opciones del asistente).

---

## Uso

### CLI interactiva y comandos slash

Ejecuta la interfaz en la terminal:

```bash
llm-tuner
```

Ejecutar `llm-tuner` sin argumentos abre un menú interactivo para seleccionar la acción deseada:
- `/load`: Ajustar y cargar un modelo con la configuración óptima para tu hardware
- `/mcp`: Conectar tu motor local como servidor MCP con agentes de IA (Claude, OpenCode, VS Code, Codex)
- `/presets`: Listar e inspeccionar los presets guardados
- `/settings`: Configurar idioma (`en` / `es`) y tema visual (`system` / `light` / `dark`)
- `/help`: Mostrar ayuda y opciones de uso
- `/exit`: Salir del menú

También puedes ejecutar cualquier comando slash directamente desde tu terminal:

```bash
llm-tuner /load
llm-tuner /mcp
llm-tuner /presets
llm-tuner /settings
```

### Aplicación de escritorio

Ejecuta la interfaz de escritorio:

```bash
llm-tuner-desktop
```

> **Nota**: El entorno de ejecución de Electron se descarga la primera vez que ejecutas `llm-tuner-desktop`. Se requiere conexión a internet en esa primera ejecución.

### Modo CLI no interactivo

Útil para automatizaciones, scripts y entornos desatendidos:

```bash
# Ejecución básica con perfil balanced
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --yes

# Especificando perfil de carga
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --profile quality --yes

# Listar presets guardados
llm-tuner --presets

# Configurar idioma o tema
llm-tuner /settings
```

### Referencia de opciones CLI

| Opción | Descripción | Valor predeterminado |
|---|---|---|
| `--engine <lmstudio\|ollama>` | Motor local objetivo. | Preguntado interactivamente |
| `--model <key>` | Clave del modelo (LM Studio) o nombre/etiqueta (Ollama). | Preguntado interactivamente |
| `--ctx <tokens>` | Tamaño de contexto en tokens (ej. `16384`). | Preguntado interactivamente |
| `--profile <speed\|balanced\|quality>` | Perfil de carga a optimizar. | `balanced` |
| `--force` | Forzar nueva medición aunque exista un preset. | `false` |
| `--candidates <n>` | Número de configuraciones candidatas a medir. | `3` |
| `--yes` | Ejecutar sin pedir confirmación. | `false` |
| `--dry-run` | Medir sin aplicar cambios ni guardar presets. | `false` |
| `--presets` | Listar presets guardados. | — |
| `--json` | Salida en formato JSON. | `false` |
| `--lang <en\|es>` | Establece y guarda el idioma de la interfaz. | Sistema / `en` |
| `--theme <system\|light\|dark>` | Establece y guarda el tema de la interfaz. | `system` |
| `/settings` | Menú interactivo de configuración. | — |
| `--help` | Muestra la ayuda de comandos. | — |

---

## Qué se prueba

Para cada tipo de caché KV admitido por el perfil (`f16`, `q8_0`, `q4_0`):

1. **Inspección de tensores GGUF**: Lectura directa de tensores para conocer el peso exacto por capa.
2. **Modelado de memoria de contexto**: Cálculo de la caché KV según atención, cabezas, dimensiones y ventana deslizante (SWA).
3. **Reparto en múltiples GPUs**: Distribución proporcional al margen libre de VRAM, priorizando enlaces PCIe más anchos y excluyendo monitores.
4. **Descarga en modelos MoE**: En modelos con Mixture of Experts que exceden la VRAM, determina cuántos expertos pueden operar en RAM (`--n-cpu-moe`).
5. **Medición empírica**: Pruebas con un prompt corto y otro que ocupa ~50% del contexto.
6. **Aplicación de configuración**:
   - **LM Studio**: Escribe la configuración por modelo en `~/.lmstudio/.internal/user-concrete-model-default-config/` y actualiza `hardware-config.json`.
   - **Ollama**: Genera un Modelfile específico (`<modelo>-tuned-<ctx>`) y ajusta las variables de entorno del servidor. Siempre se crea una copia de respaldo `*.bak-llm-tuner-*` antes de modificar archivos.

---

## Dónde se guardan los presets

Existe un preset por cada combinación de motor, modelo, contexto y perfil:

- **Linux**: `~/.config/llm-tuner/presets/`
- **macOS**: `~/Library/Application Support/llm-tuner/presets/`
- **Windows**: `%APPDATA%\llm-tuner\presets\`

---

## Estado por plataforma

| Plataforma y Motor | Estado | Notas |
|---|---|---|
| **Linux + NVIDIA + LM Studio** | ✅ Verificado | Calibrado con mediciones reales (2× RTX 5070, Ryzen 7 5800X). |
| **Linux + Ollama** | ✅ Verificado | Comprobado mediante instancias privadas y suite de pruebas unitarias. |
| **Windows / macOS** | 🧪 Soportado | Rutas oficiales, comandos del sistema y detección implementados. |
| **AMD ROCm / Apple Silicon / Intel Arc** | 🧪 Soportado | Detección de VRAM activa; ancho de banda estimado por tabla de especificaciones. |

---

## Arquitectura del proyecto

```
llmtuner/
├── src/
│   ├── core/           # Núcleo del afinador, estimador, detección de hardware, presets y perfiles
│   │   ├── engines/    # Controladores de LM Studio y Ollama
│   │   ├── estimator.js# Modelado matemático de memoria y VRAM
│   │   ├── gguf.js     # Parser de tensores GGUF
│   │   ├── hardware.js # Detección de GPU, enlaces PCIe y estado de VRAM
│   │   ├── presets.js  # Lógica de guardado e invalidación de presets
│   │   └── profiles.js # Reglas de perfiles speed, balanced y quality
│   ├── cli/            # Asistente interactivo y análisis de argumentos CLI
│   ├── i18n/           # Catálogos de internacionalización en español e inglés
│   └── web/            # Servidor HTTP/SSE embebido que alimenta la interfaz gráfica
├── electron/           # Lanzador y proceso principal de Electron
├── test/               # Suite de pruebas unitarias de Node.js
└── docs/               # Especificaciones técnicas, mediciones reales y notas
```

---

## Desarrollo y pruebas

Clonar y preparar el repositorio local:

```bash
git clone https://github.com/ronald32acunadev/llmtuner.git
cd llmtuner
npm install

# Iniciar asistente CLI
npm start

# Iniciar aplicación de escritorio
npm run desktop

# Ejecutar suite de pruebas
npm test
```

La suite incluye pruebas de regresión que verifican los resultados reales de doble RTX 5070 con Qwen2.5-Coder-32B.

---

## Notas y solución de problemas

- **Descarga inicial de Electron**: Electron se descarga al ejecutar por primera vez `llm-tuner-desktop`. En entornos cerrados sin conexión, extrae `electron-v*.zip` en la carpeta `dist/` del paquete instalado de `electron` y crea `path.txt` con el texto `electron`.
- **Instalaciones con sudo / permisos**: Evita instalar con permisos de superusuario desalineados (`sudo npm install -g`), ya que Electron podría no poder descomprimir sus binarios en la carpeta del usuario.
- **Compatibilidad con LM Studio**: Verificado y calibrado con LM Studio 0.4.25+.

---

## Licencia

[MIT](LICENSE) © Ronald Daniel Acuña Arias
