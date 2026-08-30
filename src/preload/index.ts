import { contextBridge, ipcRenderer } from "electron";
import {
  BOOTSTRAP_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type CodexStyleApi,
  type Result,
  type ThemeSnapshot,
} from "../contracts";

const invoke = <T>(channel: string, payload: unknown): Promise<Result<T>> =>
  ipcRenderer.invoke(channel, payload) as Promise<Result<T>>;

const api: CodexStyleApi = {
  rendererReady: () =>
    invoke("studio.rendererReady", { v: BOOTSTRAP_PROTOCOL_VERSION }),
  openLogDirectory: () =>
    invoke("diagnostics.openLogs", { v: PROTOCOL_VERSION }),
  installAssistantPlugin: () =>
    invoke("assistant.installPlugin", { v: PROTOCOL_VERSION }),
  getSnapshot: () => invoke("studio.getSnapshot", { v: PROTOCOL_VERSION }),
  getTheme: (request) =>
    invoke("theme.get", { v: PROTOCOL_VERSION, ...request }),
  createDraft: (request) =>
    invoke("theme.createDraft", { v: PROTOCOL_VERSION, ...request }),
  patchDraft: (request) =>
    invoke("theme.patchDraft", { v: PROTOCOL_VERSION, ...request }),
  discardChanges: (request) =>
    invoke("theme.discardChanges", { v: PROTOCOL_VERSION, ...request }),
  chooseBackground: (request) =>
    invoke("theme.chooseBackground", { v: PROTOCOL_VERSION, ...request }),
  chooseSendIcon: (request) =>
    invoke("theme.chooseSendIcon", { v: PROTOCOL_VERSION, ...request }),
  chooseHomeCardImage: (request) =>
    invoke("theme.chooseHomeCardImage", {
      v: PROTOCOL_VERSION,
      ...request,
    }),
  commit: (request) =>
    invoke("theme.commit", { v: PROTOCOL_VERSION, ...request }),
  deleteTheme: (request) =>
    invoke("theme.delete", { v: PROTOCOL_VERSION, ...request }),
  importZip: () => invoke("theme.importZip", { v: PROTOCOL_VERSION }),
  resolveImport: (request) =>
    invoke("theme.resolveImport", { v: PROTOCOL_VERSION, ...request }),
  exportZip: (request) =>
    invoke("theme.exportZip", { v: PROTOCOL_VERSION, ...request }),
  selectForNextLaunch: (request) =>
    invoke("theme.selectForNextLaunch", { v: PROTOCOL_VERSION, ...request }),
  clearSelection: () => invoke("theme.clearSelection", { v: PROTOCOL_VERSION }),
  launchSession: () => invoke("session.launch", { v: PROTOCOL_VERSION }),
  pauseSession: () => invoke("session.pause", { v: PROTOCOL_VERSION }),
  resumeSession: () => invoke("session.resume", { v: PROTOCOL_VERSION }),
  endOwnedSession: () => invoke("session.endOwned", { v: PROTOCOL_VERSION }),
  getUpdateStatus: () => invoke("update.getStatus", { v: PROTOCOL_VERSION }),
  requestUpdate: () => invoke("update.request", { v: PROTOCOL_VERSION }),
  cancelUpdate: () => invoke("update.cancel", { v: PROTOCOL_VERSION }),
  installUpdate: (request) =>
    invoke("update.install", { v: PROTOCOL_VERSION, ...request }),
  openUpdatePage: () => invoke("update.openRelease", { v: PROTOCOL_VERSION }),
  onStateChanged: (listener: (snapshot: ThemeSnapshot) => void) => {
    const callback = (
      _event: Electron.IpcRendererEvent,
      snapshot: ThemeSnapshot,
    ) => listener(snapshot);
    ipcRenderer.on("studio:state-changed", callback);
    return () => ipcRenderer.removeListener("studio:state-changed", callback);
  },
};

contextBridge.exposeInMainWorld("codexStyle", api);
