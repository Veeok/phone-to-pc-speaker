import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow } from 'electron';

const execFileAsync = promisify(execFile);

const ACTION_LABELS = [
  'Refresh Devices',
  'Enable Connection',
  'Open Connection',
  'Release Connection'
];

const PANEL_LABELS = [
  'Eligible Devices',
  'Selected Device',
  'Connection Status',
  'Last Error',
  'Diagnostics'
];

app.commandLine.appendSwitch('disable-gpu');

function logStep(message) {
  console.error(`[smoke] ${message}`);
}

function wait(milliseconds) {
  return new Promise((resolveWait) => {
    setTimeout(resolveWait, milliseconds);
  });
}

async function waitForWindow(timeoutMilliseconds = 15000) {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows()[0];
    if (window !== undefined && !window.isDestroyed()) {
      return window;
    }

    await wait(100);
  }

  throw new Error('Timed out waiting for the Electron main window.');
}

async function waitForPageLoad(window, timeoutMilliseconds = 15000) {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    if (!window.webContents.isLoadingMainFrame()) {
      return;
    }

    await wait(100);
  }

  throw new Error('Timed out waiting for the renderer page to finish loading.');
}

async function evaluate(window, code) {
  return window.webContents.executeJavaScript(code);
}

async function waitForBridgeBadge(window, predicate, timeoutMilliseconds = 20000) {
  const deadline = Date.now() + timeoutMilliseconds;
  let latestValue = null;

  while (Date.now() < deadline) {
    latestValue = await evaluate(
      window,
      `(() => {
        const bridgeBadge = [...document.querySelectorAll('.badge')].find(
          (item) => item.querySelector('.badge__label')?.textContent?.trim() === 'Bridge'
        );

        return bridgeBadge?.querySelector('strong')?.textContent?.trim() ?? null;
      })()`
    );

    if (predicate(latestValue)) {
      return latestValue;
    }

    await wait(250);
  }

  throw new Error(`Timed out waiting for the bridge badge. Latest value: ${latestValue ?? 'null'}`);
}

async function waitForPublicState(window, predicate, timeoutMilliseconds = 20000) {
  const deadline = Date.now() + timeoutMilliseconds;
  let latestValue = null;

  while (Date.now() < deadline) {
    latestValue = await evaluate(
      window,
      `(() => {
        const stateBadge = [...document.querySelectorAll('.status-card .badge')].find(
          (item) => item.querySelector('.badge__label')?.textContent?.trim() === 'Public State'
        );

        return stateBadge?.querySelector('strong')?.textContent?.trim() ?? null;
      })()`
    );

    if (predicate(latestValue)) {
      return latestValue;
    }

    await wait(250);
  }

  throw new Error(`Timed out waiting for the public state badge. Latest value: ${latestValue ?? 'null'}`);
}

async function inspectWindow(window) {
  return evaluate(
    window,
    `(() => {
      const actionLabels = ${JSON.stringify(ACTION_LABELS)};
      const panelLabels = ${JSON.stringify(PANEL_LABELS)};

      const badgeValues = Object.fromEntries(
        [...document.querySelectorAll('.badge')].map((badge) => [
          badge.querySelector('.badge__label')?.textContent?.trim() ?? 'unknown',
          badge.querySelector('strong')?.textContent?.trim() ?? null
        ])
      );

      const actionButtons = Object.fromEntries(actionLabels.map((label) => {
        const button = [...document.querySelectorAll('.action-cluster button')].find(
          (item) => item.textContent?.trim() === label
        );

        return [label, button === undefined ? null : { disabled: button.disabled }];
      }));

      const renderedPanels = [...document.querySelectorAll('.panel__header h2')].map(
        (element) => element.textContent?.trim() ?? ''
      );

      const findPanelText = (heading) =>
        [...document.querySelectorAll('.panel')]
          .find((panel) => panel.querySelector('h2')?.textContent?.trim() === heading)
          ?.innerText?.trim() ?? null;

      const lastErrorPanel = [...document.querySelectorAll('.panel')].find(
        (panel) => panel.querySelector('h2')?.textContent?.trim() === 'Last Error'
      );

      return {
        apiSurfacePresent: typeof window.phoneToPcSpeaker === 'object',
        appTitle: document.querySelector('h1')?.textContent?.trim() ?? null,
        actionButtons,
        expectedPanelsPresent: panelLabels.every((label) => renderedPanels.includes(label)),
        renderedPanels,
        badgeValues,
        diagnosticsView: document.querySelector('.tab-strip__button--active')?.textContent?.trim() ?? null,
        deviceEntries: [...document.querySelectorAll('.device-card')].map((element) => ({
          label: element.querySelector('strong')?.textContent?.trim() ?? '',
          selected: element.classList.contains('device-card--selected')
        })),
        selectedDevicePanelText: findPanelText('Selected Device'),
        connectionPanelText: findPanelText('Connection Status'),
        diagnosticsPanelText: findPanelText('Diagnostics'),
        communicationReadinessText: findPanelText('Communication Readiness'),
        lastErrorText:
          lastErrorPanel?.querySelector('.error-card__message')?.textContent?.trim() ??
          lastErrorPanel?.querySelector('.panel__empty')?.textContent?.trim() ??
          null,
        summaryDiagnosticsCount: document.querySelectorAll('.diagnostic-list__item').length,
        advancedDiagnosticsCount: document.querySelectorAll('.advanced-list__item').length
      };
    })()`
  );
}

async function clickFirstDevice(window) {
  return evaluate(
    window,
    `(() => {
      const button = document.querySelector('.device-card');
      if (button === null) {
        return { found: false, selectedLabel: null };
      }

      button.click();
      return {
        found: true,
        selectedLabel: button.querySelector('strong')?.textContent?.trim() ?? null
      };
    })()`
  );
}

async function clickAction(window, label) {
  return evaluate(
    window,
    `(() => {
      const label = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll('.action-cluster button')].find(
        (item) => item.textContent?.trim() === label
      );

      if (button === undefined) {
        return { found: false, clicked: false, disabled: null };
      }

      if (button.disabled) {
        return { found: true, clicked: false, disabled: true };
      }

      button.click();
      return { found: true, clicked: true, disabled: false };
    })()`
  );
}

async function clickDiagnosticsTab(window, label) {
  return evaluate(
    window,
    `(() => {
      const label = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll('.tab-strip__button')].find(
        (item) => item.textContent?.trim() === label
      );

      if (button === undefined) {
        return { found: false };
      }

      button.click();
      return { found: true };
    })()`
  );
}

async function terminateBridgeProcess() {
  try {
    await execFileAsync('taskkill', ['/IM', 'PhoneToPcSpeaker.WindowsBridge.exe', '/F']);
  } catch {
    // Ignore failures so the smoke test can still report the UI snapshot.
  }
}

async function run() {
  const builtMainEntry = resolve(process.cwd(), 'apps/desktop/out/main/index.js');
  logStep(`Importing desktop main entry from ${builtMainEntry}`);
  let importError = null;
  void import(pathToFileURL(builtMainEntry).href).catch((error) => {
    importError = error;
  });

  await app.whenReady();
  logStep('Electron app is ready.');

  if (importError !== null) {
    throw importError;
  }

  const window = await waitForWindow();
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logStep(`Renderer console [${level}] ${message} (${sourceId}:${line})`);
  });
  logStep('Electron main window detected.');
  await waitForPageLoad(window);
  logStep('Renderer page finished loading.');
  logStep(`Renderer URL: ${window.webContents.getURL()}`);

  await waitForBridgeBadge(window, (value) => value !== null && value !== 'starting');
  await wait(1200);
  logStep('Bridge health settled.');

  const results = {
    initial: await inspectWindow(window),
    selectedDevice: null,
    afterSelect: null,
    refreshAttempt: null,
    afterRefresh: null,
    enableAttempt: null,
    afterEnable: null,
    openAttempt: null,
    afterOpen: null,
    releaseAttempt: null,
    afterRelease: null,
    afterAdvancedDiagnostics: null,
    afterBridgeDisconnect: null
  };

  results.selectedDevice = await clickFirstDevice(window);
  logStep(`Selected device result: ${JSON.stringify(results.selectedDevice)}`);
  await wait(400);
  results.afterSelect = await inspectWindow(window);

  results.refreshAttempt = await clickAction(window, 'Refresh Devices');
  logStep(`Refresh click result: ${JSON.stringify(results.refreshAttempt)}`);
  await wait(1500);
  results.afterRefresh = await inspectWindow(window);

  results.enableAttempt = await clickAction(window, 'Enable Connection');
  logStep(`Enable click result: ${JSON.stringify(results.enableAttempt)}`);
  await waitForPublicState(window, (value) => value !== null && value !== 'Disconnected', 15000).catch(() => null);
  await wait(1000);
  results.afterEnable = await inspectWindow(window);

  results.openAttempt = await clickAction(window, 'Open Connection');
  logStep(`Open click result: ${JSON.stringify(results.openAttempt)}`);
  await waitForPublicState(window, (value) => value === 'Connected' || value === 'Failed', 30000).catch(() => null);
  await wait(1000);
  results.afterOpen = await inspectWindow(window);

  results.releaseAttempt = await clickAction(window, 'Release Connection');
  logStep(`Release click result: ${JSON.stringify(results.releaseAttempt)}`);
  if (results.releaseAttempt.clicked) {
    await waitForPublicState(window, (value) => value === 'Disconnected', 15000).catch(() => null);
  }
  await wait(1000);
  results.afterRelease = await inspectWindow(window);

  await clickDiagnosticsTab(window, 'Advanced');
  await wait(300);
  results.afterAdvancedDiagnostics = await inspectWindow(window);

  await terminateBridgeProcess();
  await waitForBridgeBadge(window, (value) => value === 'unavailable', 20000).catch(() => null);
  await wait(1500);
  results.afterBridgeDisconnect = await inspectWindow(window);

  console.log(JSON.stringify(results, null, 2));
}

const hardTimeout = setTimeout(() => {
  logStep('Hard timeout reached. Forcing process exit.');
  process.exit(124);
}, 120000);

async function main() {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    console.error(message);
    process.exitCode = 1;
  } finally {
    clearTimeout(hardTimeout);
    await wait(500);
    app.exit(process.exitCode ?? 0);
  }
}

void main();
