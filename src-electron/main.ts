import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu, protocol, session, webContents } from 'electron';
import { configureNimiElectronAppHostProfile } from '@nimiplatform/kit/shell/electron/host-profile';

declare const __NIMI_ELECTRON_PRODUCTION__: boolean;

// Bind user data, session data and temp to the Host profile Nimi Desktop
// prepared under the selected data root, before any session or window and
// before the rest of Kit loads: a module that failed to load first would
// leave Electron on its default paths in the OS user's profile.
try {
  configureNimiElectronAppHostProfile(app);
} catch (error) {
  process.stderr.write(
    `[nimi-app-host-profile] ${error instanceof Error ? error.message : String(error)}\n`,
  );
  app.exit(78);
  throw error;
}

const {
  createNimiElectronStandardApplicationMenuTemplate,
  isAllowedElectronRendererUrl,
  registerNimiElectronAppAssetProtocolScheme,
  registerNimiElectronAppBridge,
} = await import('@nimiplatform/kit/shell/electron/main');
const { ProductionController } = await import('./production-controller.js');
const { MediaRuntime, mediaPaths } = await import('./media-runtime.js');
const { randomUUID } = await import('node:crypto');
const { HostAutomation } = await import('./integration.js');

const APP_ID = 'moneyprinterturbo.studio';
const NATIVE_BUNDLE_IDENTIFIER = 'ai.nimi.apps.moneyprinterturbo.studio';
const IS_PRODUCTION_BUNDLE =
  typeof __NIMI_ELECTRON_PRODUCTION__ !== 'undefined' && __NIMI_ELECTRON_PRODUCTION__;
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(currentDir, '..');
const preloadPath = path.join(currentDir, 'preload.cjs');
const productionRendererUrl = pathToFileURL(path.join(appRoot, 'dist', 'index.html')).toString();
const developmentRendererUrl = readDevelopmentRendererUrl();
const rendererUrl = developmentRendererUrl || productionRendererUrl;
const allowedRendererUrls = [rendererUrl];
let resettingRenderer = false;
let quitting = false;
let controller: InstanceType<typeof ProductionController> | null = null;
let automation: InstanceType<typeof HostAutomation> | null = null;
const scratchRoot = path.join(app.getPath('temp'), 'mpt', randomUUID().slice(0, 8));
const requireController = () => {
  if (!controller) throw new Error('Nimi 会话尚未就绪，请检查 App Access。');
  return controller;
};

app.setName('MoneyPrinterTurbo');
app.setAppUserModelId(NATIVE_BUNDLE_IDENTIFIER);
// macOS routes Cmd+C/V/X/A/Z and Cmd+Q through application menu roles.
Menu.setApplicationMenu(
  Menu.buildFromTemplate(
    createNimiElectronStandardApplicationMenuTemplate({ appName: 'MoneyPrinterTurbo' }),
  ),
);
registerNimiElectronAppAssetProtocolScheme(protocol);

void app.whenReady().then(async () => {
  const bridge = registerNimiElectronAppBridge({
    appId: APP_ID,
    allowedRendererUrls,
    assetMediaPlatform: { protocol, webRequest: session.defaultSession.webRequest, webContents },
    ipcMain,
    appCommandHandlers: {
      'mpt.snapshot': async () => ({
        ...(await requireController().snapshot()),
        automationError: automation?.error || '',
      }),
      'mpt.settings': () => requireController().settings(),
      'mpt.settings.save': ({ payload }) =>
        requireController().saveSettings(payload.scope, payload.value),
      'mpt.import': ({ payload }) =>
        requireController().importAsset(
          payload.name as string,
          payload.mediaType as string,
          payload.bytes as Uint8Array,
        ),
      'mpt.start': ({ payload }) => requireController().start(payload.params),
      'mpt.cancel': ({ payload }) => requireController().cancel(String(payload.id)),
      'mpt.resume': ({ payload }) => requireController().resume(String(payload.id)),
      'mpt.jobs': ({ payload }) => requireController().inspectJobs(String(payload.id)),
      'mpt.cues.save': ({ payload }) =>
        requireController().editCues(String(payload.id), payload.cues),
      'mpt.regenerate': ({ payload }) => requireController().regenerate(String(payload.id)),
      'mpt.rewrite': ({ payload }) =>
        requireController().rewrite(payload.params, String(payload.instruction)),
      'mpt.preview': ({ payload }) =>
        requireController().preview(payload.params, String(payload.text)),
      'mpt.metadata': ({ payload }) => requireController().copyMetadata(String(payload.id)),
      'mpt.asset': ({ payload }) => requireController().readArtifact(String(payload.id), String(payload.name), payload.offset as number | undefined, payload.length as number | undefined),
      'mpt.publish': ({ payload }) =>
        requireController().publish(
          String(payload.id),
          String(payload.title),
          payload.platforms as string[],
          payload.options as Record<string, unknown>,
        ),
      'mpt.publish.status': ({ payload }) =>
        requireController().publicationStatus(String(payload.id)),
    },
    onSessionInvalidated: () => {
      automation?.close();
      automation = null;
      if (controller) void controller.close().catch((error) => process.stderr.write(`[mpt-cleanup] ${String(error)}\n`));
      controller = null;
      resetAccountScopedRenderer();
    },
    onSessionReady: (services) => {
      if (controller) void controller.close().catch((error) => process.stderr.write(`[mpt-cleanup] ${String(error)}\n`));
      automation?.close();
      controller = new ProductionController(
        services,
        new MediaRuntime(
          mediaPaths(
            appRoot,
            path.join(scratchRoot, randomUUID().slice(0, 8)),
            app.isPackaged,
            process.resourcesPath,
          ),
        ),
      );
      automation = new HostAutomation(services, controller);
    },
  });
  await createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (
    process.platform !== 'darwin' &&
    !resettingRenderer &&
    BrowserWindow.getAllWindows().length === 0
  )
    app.quit();
});
app.on('before-quit', (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  automation?.close();
  void (controller?.close() || Promise.resolve()).finally(() => app.quit());
});

// A revoked/account-changed scope must not leave renderer timers or queued
// promises alive to use the rebound Host. This does not run on normal renewal.
function resetAccountScopedRenderer(): void {
  const windows = BrowserWindow.getAllWindows();
  if (quitting || windows.length === 0) return;
  resettingRenderer = true;
  try {
    for (const window of windows) window.destroy();
    void createMainWindow().catch((error: unknown) => {
      process.stderr.write(
        `[nimi-app-session-reset] ${error instanceof Error ? error.message : String(error)}\n`,
      );
    });
  } finally {
    resettingRenderer = false;
  }
}

async function createMainWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 360,
    minHeight: 560,
    title: 'MoneyPrinterTurbo',
    icon: path.join(appRoot, 'assets', 'app-icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedElectronRendererUrl(url, allowedRendererUrls)) event.preventDefault();
  });
  try {
    await window.loadURL(rendererUrl);
  } catch (error) {
    if (!window.isDestroyed()) throw error;
  }
}

function readDevelopmentRendererUrl(): string {
  const flag = '--nimi-dev-renderer-url';
  const prefix = '--nimi-dev-renderer-url=';
  const hasDevelopmentRendererArgument = process.argv.some(
    (value) => value === flag || value.startsWith(prefix),
  );
  if (IS_PRODUCTION_BUNDLE && hasDevelopmentRendererArgument) {
    throw new Error('The production Electron bundle rejects --nimi-dev-renderer-url.');
  }
  if (process.argv.includes(flag)) throw new Error('Nimi development renderer URL is missing.');
  const values = process.argv.filter((value) => value.startsWith(prefix));
  if (values.length === 0) return '';
  if (values.length !== 1) throw new Error('Nimi development renderer URL must be singular.');
  const selected = values[0];
  if (!selected) throw new Error('Nimi development renderer URL is missing.');
  const raw = selected.slice(prefix.length);
  const parsed = new URL(raw);
  if (
    parsed.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsed.hostname.toLowerCase()) ||
    !parsed.port ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '/' && parsed.pathname !== '') ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('Nimi development renderer URL must be exact loopback.');
  }
  return parsed.origin;
}
