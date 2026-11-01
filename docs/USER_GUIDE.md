# LLM Tuner User Guide

This is the canonical content source for the product website: implemented functions, usage instructions, limitations, and user-visible changes. The website's existing skill can read this file; it is maintained separately and is not replaced here.

Documentation revision: **2026-10-31** (restored from the 2026-10-29 approved implementation). Commands use the executable name `llm-tuner`. Examples use placeholders, never real saved credentials. English labels below refer to the English interface; Spanish is also available.

## Navigation

- [CLI/Desktop capability inventory](#feature-parity)
- [Start here](#start-here)
- [Choose a computer](#choose-computer)
- [Tune and load a model](#load-model)
- [Understand profiles](#profiles)
- [Inspect saved presets](#presets)
- [Test a model](#gui-chat)
- [Connect AI agents through MCP](#mcp)
- [Change settings](#settings)
- [Share this computer](#share-computer)
- [Automatic server startup and credentials](#startup-credentials)
- [Command reference](#command-reference)
- [Troubleshoot](#troubleshooting)
- [Data and safety](#data-safety)
- [Website update instructions](#website-updates)
- [User-visible changes](#changes)

<a id="feature-parity"></a>
## CLI/Desktop Capability Inventory

Parity target: CLI and Electron Desktop, not standalone browser usage. This inventory is a completion gate, not a promise that pending work already exists. Every future user-facing capability must have both entry points, paired acceptance evidence and updated instructions under `AGENTS.md`.

| Capability | CLI entry | Desktop entry | Current acceptance state |
|---|---|---|---|
| Engine/model/context/profile loading | `/load` | Engine → Model and context → Load | Existing; final paired integration proof pending |
| Candidate count | `--candidates` | **Configurations to measure** | Implemented; automated checks pass |
| Local/remote dry-run | `--dry-run` | **Dry run** checkbox | Implemented; automated checks pass |
| Application preview/confirmation | Prompt, local and remote; `--yes` skips it | **Apply these changes?** panel | Implemented; automated checks pass |
| Conversation testing | `/chat`, `--prompt` | Chat form | Implemented; automated checks pass |
| Full preset inventory/filtering | `/presets` | **Saved presets** in the sidebar | Implemented; automated checks pass |
| First-model download | Local empty-list prompt | **Download a first model** form | Implemented; automated checks pass |
| Saved-computer operations | Settings manager | Settings → Servers | Implemented; automated checks pass |
| Configure/start shared server | `/serve` | Settings → **Share this computer** | Implemented; real Electron window check pending |
| MCP endpoint/name/agent setup | `/mcp` | Add as MCP Server | Implemented; automated checks pass |
| Remote progress/results | Same events as a local load | Load progress/log/telemetry | Implemented; automated checks pass |
| Language/theme preferences | `/settings`, flags | Settings | Existing; final paired regression proof pending |
| Local startup/credential access | `/settings` | Native Local Server Settings | Existing; privileged behavior must remain trusted/local |
| Local engine installation | Guided engine install | Engine install controls | Existing; unauthorized remote installation remains forbidden |

No 100% completion claim is valid while required counterparts or verification remain pending. Standalone browser exclusions do not permit weakening authenticated APIs or trusted Electron IPC. The approved story tracker records detailed acceptance and observed results.

<a id="start-here"></a>
## Start Here

**Purpose:** choose how to use the same tuning core: terminal, Desktop, or browser.

**Prerequisites:** Node.js 22 or newer for CLI/source usage; an installed LM Studio or Ollama engine and a downloaded model on the computer that will run inference. Desktop additionally needs a working Electron runtime. Hardware and engine availability affect which configurations are possible.

1. For an installed CLI, run `llm-tuner`. In a checked-out, dependency-installed source tree, run `npm start`.
2. Use `llm-tuner-desktop` for Desktop, or `npm run desktop` from the source tree.
3. For a local browser UI from the source tree, run `node src/web/server.js --open`. It normally uses `http://127.0.0.1:7860` unless `PORT` is set.
4. Choose a task: load a model, configure MCP, inspect presets, share this computer, change settings, or read help. Use `/exit` or the exit menu item to leave the CLI.

**Expected result:** the CLI offers a task menu; Desktop/browser shows Engine, Model and context, and Load sections. Desktop and browser share the renderer, but native startup and credential controls require Desktop.

**Recovery:** if Desktop cannot obtain/start Electron, inspect the terminal error and use the CLI while resolving it. There is no `npm run build` script. Closing Desktop also closes its embedded UI server; it does not necessarily stop an independently running `/serve` process.

<a id="choose-computer"></a>
## Choose a Computer

**Purpose:** decide where models, hardware detection, measurements, and inference run. Connecting to another computer and sharing this computer are different tasks.

### Connect from the CLI

**Prerequisites:** the other computer runs LLM Tuner's server, has the engine/models installed, and is reachable through a permitted network. Obtain its reachable server URL and authentication token from its owner. A bind address such as `0.0.0.0` is not a destination URL.

1. On the computer you are using, run `llm-tuner /settings`.
2. Choose **Add, test, select, or remove a saved computer**.
3. Choose **Add another computer**. Enter a recognizable name, the full HTTP(S) server URL, and its token. Token entry is hidden. Example address: `http://192.168.1.20:7860`.
4. Saving adds the connection without contacting the server or selecting it. Choose **Test connection to …** explicitly to check connectivity.
5. Choose **Use … for model operations** to make it active. The menu identifies the active computer by name and URL.
6. Return and run `/load` or `/presets`. Later, select **Local Machine** to return to local operation.

**Expected result:** the saved active target persists across invocations. Adding or testing a connection does not itself switch targets. Selecting a target does not start a server or install models.

To remove a saved connection, choose its remove action and confirm. Removing the active remote connection returns the active target to Local Machine. The built-in local entry cannot be removed. Removal changes only the saved connection, not data or models on the other computer.

**Recovery:** cancel/back before saving to leave settings unchanged. If a connection test fails, check the URL, port, network, running server, and exact token. Do not paste tokens into issue reports. HTTP does not encrypt the token or traffic; HTTPS URLs require an independently configured TLS endpoint because the built-in server has no TLS setup.

### Connect from Desktop or browser

1. Open **Settings → Servers → + Add**.
2. Enter **Server Name**, **Server URL**, and **Authentication Token**.
3. Use **Test Connection** to check the entered details, then **Save Server**.
4. Saving does not switch computers, the same as the CLI. Choose the server in the selector to use it. **Test connection** checks the selected computer, and **Remove** asks for confirmation first.

**Expected result:** after you select a server, model and hardware information is refreshed for that target. Removing the selected server returns to Local Machine.

Use the local GUI as the client. Opening a protected `/serve` URL directly in an ordinary browser is not an authentication/login flow: protected requests require a Bearer authorization header, and the page has no token-login screen.

<a id="load-model"></a>
## Tune and Load a Model

**Purpose:** reuse a matching preset or measure candidate configurations and apply a suitable one.

### Guided CLI

1. Confirm the active computer in Settings, especially before using a remote GPU computer.
2. Run `llm-tuner /load` or select the load task from the main menu.
3. Select LM Studio or Ollama, then an installed model. A missing local engine/model can offer an installation/download flow; review the command and any required authorization. Remote engines/models must be installed on the remote computer instead.
4. Enter a context size. Context is the token budget for the model, not the length of one answer. The prompt shows model limits, GPU estimates, and previously tuned contexts where available.
5. Select a load profile. Guidance can show recommended variants and fallback explanations when the engine's profile preview is available. Saved preferences may preselect a profile; fully specified scripted runs retain their noninteractive defaults.
6. Follow progress. On the local path, review the application preview and confirm when prompted. The remote API load path applies without that local confirmation step.
7. Inspect the final loaded-model result, benchmark rates, fallback notices, and any manual instructions.

```bash
llm-tuner /load --engine ollama --model YOUR_MODEL_KEY --ctx 8192 --profile balanced
```

**Expected result:** a valid existing preset is reused; otherwise candidates are measured, a winning preset is saved, configuration is applied, and the model is loaded when possible. The actual loaded variant can differ by profile and engine capability. Pending manual Ollama instructions must be completed before expecting final loading.

### Desktop or browser

1. Select an **Engine**, then a **Model**.
2. Set **Context (tokens)** and **Load profile**. Inspect the metadata and context/profile guidance.
3. Enable **Measure again even if a preset exists** only when you want fresh measurements.
4. Optional: set **Configurations to measure** (three when empty), or enable **Dry run** to preview without applying.
5. Select **Load**. Follow progress, hardware telemetry and configuration rows.
6. When **Apply these changes?** appears, review the list and select **Apply and load** or **Do not apply**. Without an answer in two minutes, or if the window disconnects, the changes are not applied.

If the model list is empty on the local computer, use **Download a first model**. With a remote computer selected, prepare models on that computer.

### Measurement options and limitations

- `--force`: measure again instead of reusing a matching preset.
- `--candidates <n>`: limit candidate configurations; the default is three. A value that is not a positive whole number is refused before anything runs.
- `--yes`: skip the final apply confirmation, local or remote; it does not grant unrelated administrator permissions.
- `--json`: emit the load result as JSON and avoid interactive profile/authorization prompts. Supply engine, model, and context for predictable automation.
- `--dry-run`: works on the local or the selected remote computer. It skips final preset persistence/application/loading, but can unload models and run real benchmarks with temporary configuration. It is not a side-effect-free preview.
- Declining keeps any measurements already saved as a preset: only the final apply and load are skipped.

**Recovery:** lower context if no configuration fits; inspect per-candidate errors, choose another profile, or confirm the engine is running. An empty remote model list requires downloading a model on that computer, not on the client. Disconnecting the UI or pressing Ctrl+C is not a coordinated server-job cancellation mechanism.

<a id="profiles"></a>
## Understand Profiles

| Profile | Intended behavior | Important limitation |
|---|---|---|
| `balanced` | Keep the selected variant and balance measured throughput with KV-quality scoring. | Default for fully specified CLI runs without an explicit profile. |
| `speed` | Favor the lightest downloaded variant and throughput. | Does not imply a new model download or guaranteed speedup. |
| `quality` | Prefer the heaviest downloaded variant that fits fully on GPU, with higher-quality KV settings. | Hardware/engine constraints can require a reported fallback. |

1. Download desired variants through the engine before tuning.
2. Choose the profile matching your goal.
3. Read any variant-switch instruction or fallback message and check the actual loaded model.

Profiles are goals, not guarantees of unchanged quality or exact performance. Plans estimate feasibility; measured results depend on current hardware and workload. If an engine cannot switch variants itself, follow the displayed recommendation in that engine.

<a id="presets"></a>
## Inspect Saved Presets

**Purpose:** inspect tuning measurements already saved on the active computer.

1. Run `llm-tuner /presets`.
2. Optionally filter by engine or model:

   ```bash
   llm-tuner /presets --engine ollama --model YOUR_MODEL_KEY
   ```
3. Check contexts and recorded throughput; run `/load` with the corresponding model/context to reuse a valid result.

In Desktop, select **Saved presets** in the sidebar and filter by engine or model.

**Expected result:** both list matching saved presets or explain that none exist. GUI preset chips/context suggestions concern the selected model, not a global administration screen. Hardware/model changes can invalidate a preset; different profiles have separate preset records.

There are no built-in rename/import/export/delete preset workflows. Do not confuse removing a saved server connection with removing its presets.

<a id="gui-chat"></a>
## Test a Model

**Purpose:** verify inference after loading.

### CLI

1. Run `llm-tuner /chat`, choose the engine and model, and type messages. History is kept for the session.
2. Type `/exit` to leave. The command never loads or downloads a model, and does not change settings.
3. For one scripted message:

   ```bash
   llm-tuner /chat --engine ollama --model YOUR_MODEL_KEY --prompt "Hello"
   ```

### Desktop

1. Load a model successfully.
2. Use the GUI's **Test connection** control to verify engine reachability if needed.
3. Enter a prompt in the chat area and select **Send**.
4. Inspect the response or displayed error. With a remote target, inference runs there.

**Recovery:** distinguish this engine test from **Test Connection** in the saved-server form. A reachable LLM Tuner server does not prove its engine/model is ready. Check the engine's listening address, loaded model, and error message.

<a id="mcp"></a>
## Connect AI Agents Through MCP

**Purpose:** configure supported agents to access an engine through an MCP bridge. This does not start the engine or install an AI agent.

**Prerequisites:** the agent is installed on the computer whose configuration will be changed, Node/npm can run the bridge, and the engine endpoint is reachable from that computer.

### CLI

1. Run `llm-tuner /mcp`.
2. Choose the installed engine.
3. Select agents with Space; press Enter to confirm.
4. Review the configuration results and any per-agent failure; restart/reload the agent as needed to discover the MCP entry.

Advanced example (agent selection remains interactive):

```bash
llm-tuner /mcp --engine lmstudio --name my-engine --host http://192.168.1.20:1234/v1 --apiKey YOUR_ENGINE_API_KEY
```

The option is `--apiKey`, not `--api-key`; no `--agents` flag is implemented.

### Desktop or browser

The engine does not have to be installed on this computer if you enter its endpoint in the advanced options.

1. Choose the engine and select **Add as MCP Server**.
2. Set **MCP Server Name**, select agents, and expand **Advanced connection options** if needed.
3. Verify **Base URL / Host** and **API Key**, then select **Save & Configure**.
4. Read successes and failures; reload the relevant agents.

Supported agent entries: Claude Desktop, Claude Code, OpenCode, Antigravity, VS Code, and ChatGPT / Codex. Availability and configuration destinations depend on the OS/agent installation.

**Expected result:** agent configuration on the local configuration-writing computer is updated, preserving unrelated JSON entries and backing up replaced files. LM Studio uses the OpenAI-compatible bridge; Ollama uses its Ollama bridge. Bridge packages are obtained through `npx` and can require network access.

**Remote boundary:** selecting a remote LLM Tuner server can prefill the engine hostname, but MCP configuration stays local. The bridge connects directly to the engine port (normally LM Studio `1234` or Ollama `11434`), not LLM Tuner port `7860`. The LLM Tuner server token is not the engine API key. Explicit `--host` overrides the inferred engine host.

**Recovery:** verify the agent configuration destination, engine endpoint/key, and direct network reachability. Do not assume configuring MCP through a remote selection modifies agents installed on the remote server.

<a id="settings"></a>
## Change Settings

1. Run `llm-tuner /settings` or open GUI **Settings**.
2. Choose English/Spanish and System/Light/Dark theme. These preferences are saved.
3. Use saved-computer management to change targets; it is separate from this computer's server startup and token-display controls.
4. Return to the main task. CLI also accepts `--lang en|es` and `--theme system|light|dark` to save these preferences.

The load wizard can save a selected profile. Automated CLI loads without an explicit profile retain `balanced`; do not assume a saved GUI/wizard preference overrides scripted compatibility behavior.

<a id="share-computer"></a>
## Share This Computer

**Purpose:** run a LLM Tuner server on the computer that owns the GPU/engines/models.

1. On that computer, install/start the desired engine and download a model.
2. Start the server, choosing the interface intentionally:

   ```bash
   llm-tuner /serve --host 0.0.0.0 --port 7860
   ```
3. Read the printed connection details. Share a reachable LAN address and token with the authorized connecting user through a private channel. `0.0.0.0` means listen on available interfaces; clients must use a real address.
4. On the client computer, follow [Choose a computer](#choose-computer). Keep the server process running while it is needed.

**Expected result:** the server persists its configuration and prints its URL/token. Without `--token`, it reuses a saved token when available or generates one. Supply `--token YOUR_PRIVATE_TOKEN` only intentionally; command-line arguments may be visible in shell history/process listings. Stop a foreground server with Ctrl+C when finished.

In Desktop, open **Settings → Share this computer**. **Host** starts with this computer's IP address; change it only if you want another interface. Set the port, optionally a token, and select **Start sharing**. It follows the same rules as `/serve`, and sharing stops when you close the app.

A failed start keeps the saved configuration unchanged. `/serve` defaults to port 7860 and host `0.0.0.0`; use `--host 127.0.0.1` for loopback-only access. The built-in server uses HTTP, not TLS. Do not expose it directly to the public internet or treat a token as encryption. Remote engine installation is deliberately unavailable; perform installation on the engine computer.

<a id="startup-credentials"></a>
## Automatic Server Startup and Credentials

### CLI

1. Open `/settings` on the computer that should host the server.
2. Choose its server startup option and enable or disable startup after login.
3. Read the confirmed result. Enabling affects the next login, not an immediate connection/start operation.
4. To obtain that computer's saved server details, explicitly select **View server connection details and token**. This action intentionally reveals the token; ordinary saved-computer listings do not.

### Desktop

1. Launch through `llm-tuner-desktop`.
2. Open **Settings → Local Server Settings** and set **Server Autostart**.
3. Use **Server Token → Reveal** or **Copy** only when needed. Check the action's result rather than assuming clipboard access succeeded.

These native controls are not available in a generic browser. They manage the local hosting computer, not a currently selected remote server. Saved startup configuration must be valid for login startup to succeed. Operating-system-specific installation/permission errors require following the displayed instructions; no silent elevation is promised.

<a id="command-reference"></a>
## Command Reference

Run `llm-tuner --help` for the installed version's current help and `llm-tuner --version` for its version. Slash commands also accept positional forms such as `llm-tuner load`.

| Command/options | Usage |
|---|---|
| No arguments | Interactive task menu in a terminal. |
| `/chat` | Test a loaded model; `--engine`, `--model`, `--prompt`, `--json`. Type `/exit` to leave. |
| `/load` | Tune/load; `--engine`, `--model`, `--ctx`, `--profile`, `--candidates`, `--force`, `--yes`, `--dry-run`, `--json`. |
| `/presets` | List presets; optional `--engine` and `--model` filters. |
| `/mcp` | Configure agents; optional `--engine`, `--name`, `--host`, `--apiKey`; agent selection is interactive. |
| `/settings` | Language, theme, saved computers, local server startup, explicit local connection/token display. |
| `/serve` | Share this computer; optional `--host`, `--port`, `--token`. |
| `/help`, `--help`, `-h` | Help. |
| `--version`, `-v` | Installed version. |
| `/exit` | Leave the interactive CLI. |
| `--server <id-or-name>` | Select an already saved computer persistently; combine with a command when scripting. It does not add or start a server. |
| `--lang en|es`, `--theme system|light|dark` | Save interface preferences. |

```bash
llm-tuner /load --server "Lab PC" --engine ollama --model YOUR_MODEL_KEY --ctx 8192 --profile balanced --yes --json
```

Use a real saved name/ID and an installed model key. Do not use `--json` as a substitute for supplying required inputs. There is no CLI chat or coordinated cancellation command.

<a id="troubleshooting"></a>
## Troubleshoot

| Symptom | Next step |
|---|---|
| Server unreachable | Check the hosting process, destination address/port, binding and firewall with its owner; explicitly test the saved connection again. |
| HTTP 401 | Check the saved authentication token. A configured token can be required even on loopback. |
| Remote target has no models | Download a model on the remote computer; do not install a local engine to fix a remote inventory. |
| No configuration fits / load fails | Lower context, inspect candidate errors, verify engine readiness, and consider another profile. |
| Server already loading | Wait for the current job. Closing a browser stream does not stop the job. |
| Ollama reports manual commands | Read and run only the appropriate authorized commands on the engine computer, then retry. |
| MCP configured but agent cannot infer | Check the engine port/key and direct reachability from the agent computer, then reload its configuration. |
| Startup cannot be enabled | Review the local OS error and saved server configuration; generic browser clients cannot perform native Desktop actions. |
| Confirmation is no longer pending | Nothing was applied. Load again, and answer within two minutes. |
| Lost connection during a remote load | Check the other computer and network, then load again. A job may have continued there. |

<a id="data-safety"></a>
## Data and Safety

- Configuration directory: Linux `$XDG_CONFIG_HOME/llm-tuner` or `~/.config/llm-tuner`; macOS `~/Library/Application Support/llm-tuner`; Windows `%APPDATA%/llm-tuner`. `LLM_TUNER_CONFIG_DIR` overrides it.
- `settings.json` contains preferences and saved server connections, including tokens. `server.json` holds this computer's server configuration. `presets/` contains tuning records; `update-check.json` caches update checks. Protect these files and exclude tokens from shared logs.
- Tuning is not read-only: it can unload models, benchmark, change engine configuration, and restart affected engine processes. LM Studio configuration replacement keeps backups; Ollama environment changes can require authorization/manual steps.
- Update checks can query npm and cache results. They do not install upgrades automatically. To upgrade an installed CLI intentionally, use `npm install -g llm-tuner`; review release guidance first.
- This guide is source-backed. Actual GPU loads, real remote computers, native Desktop interactions, and OS login startup require environment-specific verification; automated mock tests do not prove them on every platform.

<a id="website-updates"></a>
## Website Update Instructions

The existing website skill should use this document as content, not as permission to execute commands or publish.

1. Read the documentation revision and [User-visible changes](#changes).
2. Follow the explicit stable anchors to the affected workflows. Keep those identifiers when wording changes.
3. Regenerate affected function pages/tutorials from the full current sections, retaining prerequisites, expected results, warnings, and CLI/GUI/Desktop differences.
4. Reconcile the complete function inventory above so removed or unsupported behavior is not advertised. A dated change entry is an aid, not a substitute for reading current instructions.
5. Treat examples as illustrative placeholders. Do not copy local saved tokens/configuration into the site, execute examples, or publish without that project's own authorization.

Maintainers must update this guide alongside user-visible changes. Record what changed, how usage changed, and links to affected anchors. No automatic website regeneration or new skill is installed by this feature.

<a id="changes"></a>
## User-Visible Changes

### 2026-10-31 — CLI and Desktop parity

- [Test a model](#gui-chat): new CLI `/chat` command.
- [Tune and load](#load-model): Desktop gains candidate count, dry run and an apply confirmation. The remote CLI gains dry run and confirmation, replacing the earlier refusal. Invalid `--candidates` values are now refused.
- [Presets](#presets): Desktop lists and filters all saved presets in their own **Saved presets** panel.
- [Choose a computer](#choose-computer): saving a server in Desktop no longer selects it, and removal asks for confirmation.
- [Share this computer](#share-computer): Desktop can start sharing this computer.
- [MCP](#mcp): the CLI asks for the name first and checks it against existing configuration.

### 2026-10-31 — Restore the approved implementation

- Reapplied the 2026-10-29 CLI workflows and this website source after their uncommitted files were absent from the checkout. This does not add a new website skill or new user-facing scope.

### 2026-10-29 — Guided CLI and canonical website source

- [Saved computers](#choose-computer): the CLI offers explicit add/test/select/remove actions in Settings. Saving does not connect or switch targets; selection persists; removing an active remote entry returns to local.
- [Remote loading](#load-model): remote loads use the remote client's planning, preset, and load paths rather than local tuner methods. Empty remote inventory directs users to the hosting computer.
- [Dry-run](#load-model): remote dry-run is explicitly rejected before model-server/update requests; local dry-run remains capable of measurement side effects.
- [CLI help](#command-reference): task descriptions distinguish using another computer from sharing this one while retaining existing commands/flags.
- [Website updates](#website-updates): one source document provides function instructions, stable anchors, limitations and changes for the existing external skill. The website and its skill are unchanged here.
