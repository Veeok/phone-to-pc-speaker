import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_TITLE,
  DESKTOP_SHELL_EVENT_CHANNEL,
  DESKTOP_SHELL_REQUEST_CHANNEL,
  RENDERER_EVENT_CHANNEL,
  RENDERER_REQUEST_CHANNEL,
  type BridgeEvent,
  type BridgeRequest,
  type UserFacingError
} from '@phone-to-pc-speaker/shared-types';
import { BridgeController } from './bridge-controller';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBridgeRequest(value: unknown): value is BridgeRequest {
  return (
    isObjectRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    'payload' in value
  );
}

function invalidRequestError(): UserFacingError {
  return {
    code: 'INTERNAL_ERROR',
    message: 'Renderer sent an invalid bridge request payload.',
    recoverable: false,
    suggestedAction: 'Restart the desktop app.'
  };
}

const bridgeController = new BridgeController((event: BridgeEvent) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(RENDERER_EVENT_CHANNEL, event);
    }
  }
});

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const desktopPackageVersion = (() => {
  try {
    const packageJsonPath = resolve(currentDirectory, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };
    return packageJson.version ?? app.getVersion();
  } catch {
    return app.getVersion();
  }
})();
let mainWindow: BrowserWindow | null = null;
let appTray: Tray | null = null;
let isQuitting = false;

function buildAppIconSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="phoneToPcSpeakerGradient" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#55b7ff" />
          <stop offset="100%" stop-color="#4fd17b" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="#182338" />
      <rect x="14" y="11" width="22" height="42" rx="7" fill="none" stroke="url(#phoneToPcSpeakerGradient)" stroke-width="4" />
      <circle cx="25" cy="46" r="2.8" fill="#55b7ff" />
      <path d="M42 18v28" stroke="#4fd17b" stroke-linecap="round" stroke-width="4" />
      <path d="M50 24v16" stroke="#4fd17b" stroke-linecap="round" stroke-width="4" />
      <path d="M34 32h20" stroke="#f4f7fb" stroke-linecap="round" stroke-width="4" />
    </svg>
  `;
}

function buildTrayIconSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <path d="M7 6.5h9a2.5 2.5 0 0 1 2.5 2.5v14A2.5 2.5 0 0 1 16 25.5H7A2.5 2.5 0 0 1 4.5 23V9A2.5 2.5 0 0 1 7 6.5Z" fill="none" stroke="#f3f7fb" stroke-width="2"/>
      <circle cx="11.5" cy="21.2" r="1.2" fill="#f3f7fb"/>
      <path d="M20 11h7" stroke="#4fd17b" stroke-linecap="round" stroke-width="2.4"/>
      <path d="M23.5 7.5v13" stroke="#58b8ff" stroke-linecap="round" stroke-width="2.4"/>
      <path d="M28 13.5v8" stroke="#4fd17b" stroke-linecap="round" stroke-width="2.4"/>
    </svg>
  `;
}

function buildHideWindowIconSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect x="5" y="7" width="22" height="15" rx="3" fill="none" stroke="#58b8ff" stroke-width="2.2"/>
      <path d="M10 25.5h12" stroke="#4fd17b" stroke-linecap="round" stroke-width="2.8"/>
    </svg>
  `;
}

function buildQuitIconSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="10" fill="none" stroke="#f97373" stroke-width="2.2"/>
      <path d="M12.5 12.5 19.5 19.5" stroke="#f97373" stroke-linecap="round" stroke-width="2.8"/>
      <path d="M19.5 12.5 12.5 19.5" stroke="#f97373" stroke-linecap="round" stroke-width="2.8"/>
    </svg>
  `;
}

function createInlineSvgIcon(svg: string, size: number) {
  const svgDataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const image = nativeImage.createFromDataURL(svgDataUrl);
  return image.resize({ width: size, height: size });
}

function createAppIcon(size = 64) {
  const iconPath = resolve(app.getAppPath(), 'resources', 'app-icon.ico');
  if (existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      return image.resize({ width: size, height: size });
    }
  }

  const svgDataUrl = `data:image/svg+xml,${encodeURIComponent(buildAppIconSvg())}`;
  const image = nativeImage.createFromDataURL(svgDataUrl);
  return image.resize({ width: size, height: size });
}

function createTrayIcon(size = 18) {
  const iconPath = resolve(app.getAppPath(), 'resources', 'tray-icon.png');
  if (existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      return image.resize({ width: size, height: size });
    }
  }

  const svgDataUrl = `data:image/svg+xml,${encodeURIComponent(buildTrayIconSvg())}`;
  const image = nativeImage.createFromDataURL(svgDataUrl);
  return image.resize({ width: size, height: size });
}

function createHideWindowIcon(size = 16) {
  return createInlineSvgIcon(buildHideWindowIconSvg(), size);
}

function createQuitIcon(size = 16) {
  return createInlineSvgIcon(buildQuitIconSvg(), size);
}

function sendDesktopWindowState(window: BrowserWindow) {
  if (!window.isDestroyed()) {
    window.webContents.send(DESKTOP_SHELL_EVENT_CHANNEL, {
      isMaximized: window.isMaximized(),
      scaleFactor: getWindowScaleFactor(window)
    });
  }
}

function getWindowScaleFactor(window: BrowserWindow): number {
  const { scaleFactor } = screen.getDisplayMatching(window.getBounds());
  return Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
}

function showMainWindow() {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
    return;
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
}

function toggleMainWindowVisibility() {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    showMainWindow();
  }
}

function createTray() {
  if (appTray !== null) {
    return;
  }

  const trayMenuIconSize = process.platform === 'win32' ? 16 : 18;
  const trayMenuAppIcon = createAppIcon(trayMenuIconSize);
  const trayMenuHideIcon = createHideWindowIcon(trayMenuIconSize);
  const trayMenuQuitIcon = createQuitIcon(trayMenuIconSize);

  appTray = new Tray(createTrayIcon(process.platform === 'win32' ? 18 : 20));
  appTray.setToolTip(APP_TITLE);
  appTray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Open ${APP_TITLE}`,
        icon: trayMenuAppIcon,
        click: () => {
          showMainWindow();
        }
      },
      {
        label: 'Hide Window',
        icon: trayMenuHideIcon,
        click: () => {
          mainWindow?.hide();
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        icon: trayMenuQuitIcon,
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
  appTray.on('click', () => {
    toggleMainWindowVisibility();
  });
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 520,
    height: 780,
    minWidth: 460,
    minHeight: 680,
    title: APP_TITLE,
    backgroundColor: '#08111c',
    frame: false,
    autoHideMenuBar: true,
    icon: createAppIcon(256),
    webPreferences: {
      preload: resolve(currentDirectory, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.env.ELECTRON_RENDERER_URL !== undefined) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(resolve(currentDirectory, '../renderer/index.html'));
  }

  window.removeMenu();
  window.setMenuBarVisibility(false);
  window.on('maximize', () => sendDesktopWindowState(window));
  window.on('unmaximize', () => sendDesktopWindowState(window));
  window.on('enter-full-screen', () => sendDesktopWindowState(window));
  window.on('leave-full-screen', () => sendDesktopWindowState(window));
  window.on('ready-to-show', () => sendDesktopWindowState(window));
  window.on('move', () => sendDesktopWindowState(window));
  window.on('resize', () => sendDesktopWindowState(window));
  window.on('close', (event) => {
    if (appTray !== null && !isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  mainWindow = window;

  return window;
}

ipcMain.handle(RENDERER_REQUEST_CHANNEL, async (_event, request: unknown) => {
  if (!isBridgeRequest(request)) {
    return {
      requestId: 'invalid-request',
      ok: false,
      error: invalidRequestError()
    };
  }

  return bridgeController.handleRequest(request);
});

ipcMain.handle(DESKTOP_SHELL_REQUEST_CHANNEL, (event, request: unknown) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window === null) {
    return undefined;
  }

  if (!isObjectRecord(request) || typeof request.type !== 'string') {
    return undefined;
  }

  switch (request.type) {
    case 'get-info':
      return {
        version: desktopPackageVersion,
        isMaximized: window.isMaximized(),
        scaleFactor: getWindowScaleFactor(window)
      };
    case 'minimize':
      window.minimize();
      return undefined;
    case 'toggle-maximize':
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
      return undefined;
    case 'close':
      if (appTray !== null && !isQuitting) {
        window.hide();
      } else {
        window.close();
      }
      return undefined;
    default:
      return undefined;
  }
});

app.whenReady().then(async () => {
  app.setAppUserModelId(APP_TITLE);
  Menu.setApplicationMenu(null);
  createMainWindow();
  createTray();
  await bridgeController.start();

   screen.on('display-metrics-changed', () => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        sendDesktopWindowState(window);
      }
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      showMainWindow();
    }
  });
});

app.on('before-quit', async () => {
  isQuitting = true;
  await bridgeController.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
