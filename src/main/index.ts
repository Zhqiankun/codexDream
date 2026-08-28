import { app, dialog, protocol } from "electron";
import { AppController } from "./app/controller";

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  if (process.platform === "win32") {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: "app",
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: false,
        },
      },
    ]);
  }

  const controller = new AppController();
  let startupSucceeded = false;
  let openStudioQueued = false;

  const startupPromise = app
    .whenReady()
    .then(async () => {
      if (process.platform === "win32")
        app.setAppUserModelId("com.codexstyle.desktop");
      await controller.init();
      startupSucceeded = true;
    })
    .catch((error: unknown) => {
      console.error("CodexStyle startup failed", error);
      const detail = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox(
        "CodexStyle 启动失败",
        `应用初始化失败：${detail}\n\n应用已安全退出。请重新打开；如果仍然失败，请重新安装最新版。`,
      );
      app.quit();
    });

  const openStudioAfterStartup = () => {
    if (openStudioQueued) return;
    openStudioQueued = true;
    void startupPromise.then(() => {
      openStudioQueued = false;
      if (startupSucceeded) return controller.openStudio();
    });
  };

  app.on("activate", openStudioAfterStartup);

  app.on("before-quit", () => controller.dispose());

  app.on("second-instance", () => {
    openStudioAfterStartup();
  });

  app.on("window-all-closed", () => {
    // The process intentionally stays alive for the tray on Windows.
    if (process.platform !== "win32") app.quit();
  });

  process.on("uncaughtException", (error) => {
    console.error("CodexStyle main process error", error);
  });

  process.on("unhandledRejection", (error) => {
    console.error("CodexStyle main process rejection", error);
  });
}
