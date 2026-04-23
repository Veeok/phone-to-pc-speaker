export type UiAccent = 'signal-green' | 'arctic-blue' | 'amber';
export type UiDensity = 'comfortable' | 'compact';
export type UiMotion = 'full' | 'reduced';
export type UiDiagnosticsDefault = 'summary' | 'advanced';
export type UiSettingsCategory = 'appearance' | 'workflow' | 'diagnostics' | 'accessibility';

export interface UiSettings {
  accent: UiAccent;
  density: UiDensity;
  motion: UiMotion;
  pauseInBackground: boolean;
  defaultDiagnosticsView: UiDiagnosticsDefault;
  confirmBeforeRelease: boolean;
  confirmBeforeOpen: boolean;
  rememberSelectedDevice: boolean;
  showReadinessGuideOnIssues: boolean;
  showBridgeLogsInSummary: boolean;
}

export const UI_SETTINGS_STORAGE_KEY = 'phone-to-pc-speaker.ui-settings';

export const DEFAULT_UI_SETTINGS: UiSettings = {
  accent: 'signal-green',
  density: 'comfortable',
  motion: 'full',
  pauseInBackground: true,
  defaultDiagnosticsView: 'summary',
  confirmBeforeRelease: true,
  confirmBeforeOpen: false,
  rememberSelectedDevice: true,
  showReadinessGuideOnIssues: true,
  showBridgeLogsInSummary: false
};

export function loadUiSettings(): UiSettings {
  try {
    const rawValue = window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY);
    if (rawValue === null) {
      return DEFAULT_UI_SETTINGS;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<UiSettings>;
    return {
      ...DEFAULT_UI_SETTINGS,
      ...parsedValue
    };
  } catch {
    return DEFAULT_UI_SETTINGS;
  }
}

export function saveUiSettings(settings: UiSettings): void {
  window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
