# Start the server after login

Enable automatic server startup in CLI Settings to start the headless server on your next user login. The setting is off until enabled, and changing it does not start or stop a server immediately.

## Quick path

1. Run `llm-tuner` and select **Settings** (or enter `/settings`).
2. Select **Automatic server startup after login**, then choose **Enable**.
3. To turn it off, return to the same setting and choose **Disable**.

The login launcher uses the saved server host, port, and authentication token. If no server configuration exists, the CLI initializes it with the existing server defaults. Disabling removes only this application's startup entry; the configuration and token remain unchanged.

## Platform behavior

| Platform | Per-user registration | Limitation |
| --- | --- | --- |
| Linux | XDG graphical-session autostart entry | Runs after graphical login; it is not a headless SSH or machine-boot service. |
| macOS | User LaunchAgent with `RunAtLoad` | Runs in the logged-in user's session. |
| Windows | Shortcut in the current user's Startup folder | Runs when that user signs in. |

This is independent of the Desktop window and does not request administrator privileges. Startup registration only schedules the next login; it does not keep the server alive after a crash or restart it during the same session.

## Errors and credentials

If the operating system rejects the registration, Settings reports the error and does not claim that startup was enabled. Fix the reported permission or filesystem problem and retry. An invalid existing `server.json` is left untouched so the saved credentials are not silently replaced.

The startup entry contains the executable and configuration directory only. It does not contain the authentication token. Keep the server token private.

## Desktop Settings

Launch `llm-tuner-desktop`, open Settings, and use **Local Server Settings → Start server after login**. The control uses the same per-user startup registration as the CLI. It schedules the next login rather than starting a server immediately. Closing Desktop closes only its own local UI server, not an independently started remote server.

Use the Node-based `llm-tuner-desktop` launcher when enabling startup. Launching Electron directly does not supply the verified Node runtime path and cannot enable startup through this control. No administrator permission is requested.

## Retrieve the server token

- **CLI:** run `llm-tuner /settings`, then choose **View server connection details and token**. Only that explicit action reads and prints the saved token.
- **Desktop:** in Local Server Settings, choose **Reveal token** or **Copy token**. The token is empty/hidden initially; hiding it or closing Settings clears it from the field. Copy reports success only after the clipboard operation succeeds.

Neither action creates a token, starts another server, or changes saved credentials. If no server configuration exists, first run `llm-tuner /serve` or enable automatic startup. Treat terminal output and the clipboard as sensitive once you explicitly reveal or copy the token.

On the other computer, add the server using its reachable LAN address and saved port, for example `http://192.168.1.10:7860`, plus the copied token. Replace that example address with the server computer's actual LAN address. `0.0.0.0` is a listen address, not a destination; `localhost` points to the client itself. This does not configure firewalls or TLS.

Desktop management and credential retrieval use a restricted Electron bridge, not new HTTP endpoints. Ordinary web or remote clients do not receive these controls. Existing remote-server connection settings remain separate from the local server credentials.
