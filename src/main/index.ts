import { app, dialog, nativeTheme, protocol } from "electron";
import { join } from "node:path";
import { AppController } from "./app/controller";
import { createMainLogger } from "./infra/main-logger";
import { PROTOCOL_VERSION } from "../contracts";

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  nativeTheme.themeSource = "dark";
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

  const logDirectory = join(app.getPath("userData"), "logs");
  const logger = createMainLogger({ directory: logDirectory });
  const controller = new AppController(undefined, logger);
  logger.info("app.process.start", {
    appVersion: app.getVersion(),
    packaged: app.isPackaged,
    protocolVersion: PROTOCOL_VERSION,
  });
  let startupSucceeded = false;
  let openStudioQueued = false;

  const startupPromise = app
    .whenReady()
    .then(async () => {
      try {
        app.setAppLogsPath(logDirectory);
      } catch (error) {
        logger.error("app.logs.path.failed", error);
      }
      if (process.platform === "win32")
        app.setAppUserModelId("com.codexstyle.desktop");
      await controller.init();
      startupSucceeded = true;
      logger.info("app.startup.ready");
    })
    .catch((error: unknown) => {
      logger.error("app.startup.failed", error);
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

  app.on("before-quit", () => {
    logger.info("app.process.beforeQuit");
    controller.dispose();
    logger.dispose();
  });

  app.on("second-instance", () => {
    logger.info("app.process.secondInstance");
    openStudioAfterStartup();
  });

  app.on("window-all-closed", () => {
    // The process intentionally stays alive for the tray on Windows.
    if (process.platform !== "win32") app.quit();
  });

  process.on("uncaughtException", (error) => {
    logger.error("app.process.uncaughtException", error);
    console.error("CodexStyle main process error", error);
  });

  process.on("unhandledRejection", (error) => {
    logger.error("app.process.unhandledRejection", error);
    console.error("CodexStyle main process rejection", error);
  });
}
