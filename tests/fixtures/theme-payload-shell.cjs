const { app, BrowserWindow, protocol } = require("electron");

// Shared only by renderer-payload E2E tests: expose an isolated app: document
// for native CSS/DOM assertions, without loading the launcher or user sessions.
const fixtureData = process.env.CODEXSTYLE_TEST_USER_DATA;
if (!fixtureData)
  throw new Error("An isolated theme-payload profile is required");
app.setPath("userData", fixtureData);
app.setPath("sessionData", fixtureData);
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true } },
]);

app.whenReady().then(async () => {
  protocol.handle("app", () => new Response("<!doctype html><html></html>"));
  const window = new BrowserWindow({
    show: false,
    width: 1100,
    height: 800,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  await window.loadURL("app://test/");
});

app.on("window-all-closed", () => app.quit());
