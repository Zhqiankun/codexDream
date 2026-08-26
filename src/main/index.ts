import { app, protocol } from "electron";
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

  void app.whenReady().then(async () => {
    if (process.platform === "win32")
      app.setAppUserModelId("com.codexstyle.desktop");
    await controller.init();
    app.on("activate", () => void controller.openStudio());
  });

  app.on("before-quit", () => controller.dispose());

  app.on("second-instance", () => {
    void controller.openStudio();
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
