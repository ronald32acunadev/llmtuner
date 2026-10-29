# Iniciar el servidor después de iniciar sesión

El inicio automático está deshabilitado hasta que se activa expresamente. Cambiar la opción programa el próximo inicio de sesión: no inicia ni detiene un servidor inmediatamente.

## Activar o desactivar

- **CLI:** ejecute `llm-tuner /settings`, seleccione la opción de inicio automático del servidor y elija habilitar o deshabilitar.
- **Escritorio:** ejecute `llm-tuner-desktop`, abra Configuración y utilice **Configuración del servidor local → Iniciar servidor después del inicio de sesión**.

Ambas interfaces administran el mismo registro del usuario. Deshabilitarlo conserva el archivo de configuración y el token. El lanzador utiliza el host, puerto y token guardados; si se habilita sin configuración previa, se inicializan los valores predeterminados.

| Plataforma | Registro | Alcance |
| --- | --- | --- |
| Linux | Entrada de inicio automático XDG | Inicio de sesión gráfico; no una sesión SSH ni el arranque previo al inicio de sesión. |
| macOS | LaunchAgent del usuario | Sesión del usuario conectado. |
| Windows | Acceso directo en Inicio del usuario | Inicio de sesión de ese usuario. |

No requiere permisos de administrador ni implementa recuperación automática tras un fallo. Cerrar la ventana de escritorio no elimina el registro ni detiene un servidor iniciado de forma independiente. Para habilitarlo desde escritorio, utilice el lanzador `llm-tuner-desktop`; abrir Electron directamente no proporciona la ruta del runtime Node requerida.

## Consultar el token

- **CLI:** en `/settings`, seleccione **Ver detalles de conexión del servidor y token**.
- **Escritorio:** en la configuración del servidor local, seleccione **Mostrar token** o **Copiar token**. El campo está vacío y oculto inicialmente; al ocultarlo o cerrar Configuración se limpia su contenido. La copia solo se confirma si la operación del portapapeles tiene éxito.

Consultar o copiar no cambia las credenciales ni inicia otro servidor. Si aún no existe configuración, ejecute `llm-tuner /serve` o habilite el inicio automático primero. El contenido de la terminal y del portapapeles debe tratarse como información sensible tras mostrar o copiar el token.

En el otro equipo, agregue el servidor con su IP LAN accesible y puerto guardado, por ejemplo `http://192.168.1.10:7860`, y el token. Sustituya esa IP por la dirección real del servidor. `0.0.0.0` es una dirección de escucha, no un destino; `localhost` apunta al propio equipo cliente. Esta función no configura el cortafuegos ni TLS.

Los controles locales y las credenciales utilizan un puente restringido de Electron; no se agregan endpoints HTTP para estas operaciones. Los clientes web o remotos no reciben esos controles. Los errores se muestran sin afirmar que la operación se completó y sin reemplazar silenciosamente una configuración inválida.
