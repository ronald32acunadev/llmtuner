# Electron 44.10.1 dictionary

Sources: Context7 /electron/electron/v44.9.3 (closest published docs: security.md, ipc.md, ipc-main.md, web-frame-main.md, web-contents.md), plus installed node_modules/electron/electron.d.ts (authoritative for 44.10.1). The 44.9.3 to 44.10.1 gap is unverified: check the d.ts when a signature matters.

```ts
contextBridge.exposeInMainWorld(apiKey: string, api: any): void;
ipcMain.handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any): void;
ipcRenderer.invoke(channel: string, ...args: any[]): Promise<any>;
event.senderFrame: WebFrameMain | null;   // null if the frame has gone away
webContents.mainFrame: WebFrameMain;
frame.origin: string;                     // use origin, not url
```
Rules from the official security tutorial:
- Validate the sender on every handler, using the frame ORIGIN and not the URL. about:blank, blob: and sandboxed documents have URLs that do not identify who controls them.
- Handle a null frame as untrusted.
- Expose one method per channel. Never expose `ipcRenderer` itself.
- A handler error reaches the renderer with only its `message`, so do not put secrets in it.

## Project usage, verbatim
```js
// electron/preload.cjs
contextBridge.exposeInMainWorld('llmTunerServer', Object.freeze({
  getAutostartStatus: () => ipcRenderer.invoke('llm-tuner:server-autostart-status'),
}));
// electron/main.js
const controls = createServerControls({ isTrusted: (event) => isTrustedServerSender(event, win.webContents, new URL(started.url).origin), ... });
ipcMain.handle('llm-tuner:server-autostart-status', (event) => controls.getAutostartStatus(event));
```
`isTrustedServerSender` (electron/server-controls.js) already compares senderFrame with the main frame and the origin. Reuse it, and call it synchronously before any await.
