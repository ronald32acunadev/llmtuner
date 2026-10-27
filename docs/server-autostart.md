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
