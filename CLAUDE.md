# LLM Tuner

App Node.js (Windows/macOS/Linux) que carga un LLM local en LM Studio u Ollama con la configuración más rápida para un contexto dado. Detecta el hardware, lee el GGUF, estima la memoria, mide las mejores opciones y guarda la ganadora como preset para no volver a medir. Tiene tres interfaces sobre un mismo núcleo: CLI, web y Electron.

**Lee `docs/PROYECTO.md` antes de cambiar nada.** Contiene la idea, el flujo de usuario acordado, la arquitectura, las fórmulas calibradas, los detalles internos de LM Studio y Ollama, las mediciones reales y los pendientes.

## Reglas del proyecto

- Ningún LLM decide la configuración: todo es determinista (hardware + metadatos + fórmulas + mediciones reales).
- Flujo de usuario: motor → modelo → contexto → **Cargar**. Si hay preset, aplicar y cargar; si no, medir, guardar el preset, aplicar y cargar. Solo se vuelve a medir si cambian el contexto, el hardware o el archivo del modelo.
- La interfaz y los mensajes van en español; el código y los identificadores, en inglés.
- Nunca escribir `hardware-config.json` de LM Studio con la app abierta. La config por modelo sí se puede escribir con la app abierta.
- Guardar siempre una copia de seguridad antes de modificar archivos de configuración de los motores.
- `src/core` no depende de ninguna interfaz; la CLI, la web y Electron solo consumen `Tuner` y sus eventos.

## Comandos

```bash
npm start        # CLI
npm run web      # http://127.0.0.1:7860
npm run desktop  # Electron
npm test         # pruebas unitarias (incluyen mediciones reales como regresión)
```
