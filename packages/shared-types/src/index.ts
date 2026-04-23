export const APP_TITLE = 'Phone To pc speaker';

export const BUTTON_LABELS = {
  refreshDevices: 'Refresh Devices',
  enableConnection: 'Enable Connection',
  openConnection: 'Open Connection',
  releaseConnection: 'Release Connection'
} as const;

export const PANEL_LABELS = {
  eligibleDevices: 'Eligible Devices',
  selectedDevice: 'Selected Device',
  connectionStatus: 'Connection Status',
  lastError: 'Last Error',
  diagnostics: 'Diagnostics'
} as const;

export const CONNECTION_STATES = [
  'Disconnected',
  'Ready',
  'Connecting',
  'Connected',
  'Failed'
] as const;

export type ConnectionState = (typeof CONNECTION_STATES)[number];

export const CONNECTION_ACTIVITIES = [
  'none',
  'refreshing-devices',
  'enabling-connection',
  'opening-connection',
  'releasing-connection',
  'loading-diagnostics'
] as const;

export type ConnectionActivity = (typeof CONNECTION_ACTIVITIES)[number];

export const CONNECTION_ACTIVITY_LABELS: Record<ConnectionActivity, string> = {
  none: 'No active task',
  'refreshing-devices': 'Refreshing devices',
  'enabling-connection': 'Enabling connection',
  'opening-connection': 'Opening connection',
  'releasing-connection': 'Releasing connection',
  'loading-diagnostics': 'Loading diagnostics'
};

export const BRIDGE_REQUEST_TYPES = [
  'bridge.ping',
  'devices.refresh',
  'connection.enable',
  'connection.open',
  'connection.release',
  'diagnostics.getRecent',
  'capabilities.getCurrent',
  'media.session.getCurrent',
  'media.session.sendCommand'
] as const;

export const BRIDGE_EVENT_TYPES = [
  'devices.updated',
  'connection.stateChanged',
  'diagnostics.appended',
  'bridge.healthChanged',
  'capabilities.updated',
  'visualizer.signalUpdated',
  'media.sessionUpdated'
] as const;

export type BridgeHealthStatus = 'starting' | 'healthy' | 'unavailable' | 'degraded';
export type DiagnosticsSeverity = 'info' | 'warning' | 'error';
export type DiagnosticsLevel = DiagnosticsSeverity;
export type DiagnosticsSource = 'renderer' | 'electron-main' | 'preload' | 'windows-bridge' | 'native-audio';
export type DiagnosticsCategory =
  | 'general'
  | 'bridge-log'
  | 'native-detail'
  | 'device-identifier'
  | 'capability-probe'
  | 'technical-context';
export type CapabilityState = 'supported' | 'unsupported' | 'unknown';
export type CapabilityConfidence = 'high' | 'medium' | 'low';
export type CapabilityEnvironmentState = 'ready' | 'blocked' | 'unknown';
export type CapabilityBridgeHealth = 'healthy' | 'degraded' | 'failed';

export const RENDERER_REQUEST_CHANNEL = 'phone-to-pc-speaker:request';
export const RENDERER_EVENT_CHANNEL = 'phone-to-pc-speaker:event';
export const DESKTOP_SHELL_REQUEST_CHANNEL = 'phone-to-pc-speaker:desktop-shell-request';
export const DESKTOP_SHELL_EVENT_CHANNEL = 'phone-to-pc-speaker:desktop-shell-event';

export interface DesktopShellInfo {
  version: string;
  isMaximized: boolean;
  scaleFactor: number;
}

export interface DesktopWindowStateChangedPayload {
  isMaximized: boolean;
  scaleFactor: number;
}

export interface DeviceSummary {
  id: string;
  name: string;
  isPaired: boolean;
  canConnect: boolean;
  isConnected: boolean;
  batteryPercent: number | null;
  manufacturer: string | null;
  modelName: string | null;
  lastSeenAt: string;
}

export interface SelectedDeviceSummary {
  id: string | null;
  displayName: string | null;
  availabilitySummary: string;
  pairingSummary: string;
  eligibilitySummary: string;
  lastSeenAt: string | null;
  rawDeviceId: string | null;
  explanation: string | null;
}

export interface BridgeHealth {
  status: BridgeHealthStatus;
  reason: string | null;
  checkedAt: string;
  bridgePath: string | null;
}

export interface MediaCapability {
  state: CapabilityState;
  reason: string;
}

export interface CallCapability {
  state: CapabilityState;
  reason: string;
}

export interface CommunicationReadiness {
  mediaAudio: MediaCapability;
  callAudio: CallCapability;
  bridgeHealth: CapabilityBridgeHealth;
  platformReadiness: CapabilityEnvironmentState;
  hardwareReadiness: CapabilityEnvironmentState;
  confidence: CapabilityConfidence;
  readinessReason: string;
  currentLimitation: string;
  readinessDetails: string | null;
  checkedAt: string;
}

export interface SummaryDiagnosticEntry {
  id: string;
  timestamp: string;
  severity: DiagnosticsSeverity;
  source: DiagnosticsSource;
  title: string;
  detail: string | null;
}

export interface AdvancedDiagnosticEntry {
  id: string;
  summaryId: string;
  timestamp: string;
  severity: DiagnosticsSeverity;
  source: DiagnosticsSource;
  category: DiagnosticsCategory;
  label: string;
  detail: string | null;
}

export interface DiagnosticsEvent {
  summary: SummaryDiagnosticEntry;
  advanced: AdvancedDiagnosticEntry | null;
}

export interface DiagnosticsSnapshot {
  summary: SummaryDiagnosticEntry[];
  advanced: AdvancedDiagnosticEntry[];
}

export type UserFacingErrorCode =
  | 'BRIDGE_UNAVAILABLE'
  | 'BRIDGE_REQUEST_FAILED'
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_NOT_SELECTED'
  | 'CONNECTION_ENABLE_FAILED'
  | 'CONNECTION_OPEN_FAILED'
  | 'CONNECTION_RELEASE_FAILED'
  | 'DIAGNOSTICS_UNAVAILABLE'
  | 'CAPABILITY_PROBE_INCONCLUSIVE'
  | 'UNSUPPORTED_PATH'
  | 'INTERNAL_ERROR';

export interface UserFacingError {
  code: UserFacingErrorCode;
  message: string;
  recoverable: boolean;
  suggestedAction: string | null;
}

export interface EmptyPayload {
  readonly empty?: true;
}

export interface BridgePingResponsePayload {
  health: BridgeHealth;
}

export interface DevicesRefreshResponsePayload {
  devices: DeviceSummary[];
}

export interface ConnectionCommandPayload {
  deviceId: string;
}

export interface ConnectionReleasePayload {
  deviceId: string | null;
}

export interface ConnectionSnapshot {
  state: ConnectionState;
  activity: ConnectionActivity;
  deviceId: string | null;
  detail: string | null;
  updatedAt: string;
}

export type ConnectionActionResponsePayload = ConnectionSnapshot;
export type ConnectionStateChangedPayload = ConnectionSnapshot;

export interface DiagnosticsGetRecentPayload {
  limit: number | null;
}

export interface DiagnosticsGetRecentResponsePayload {
  diagnostics: DiagnosticsSnapshot;
}

export interface CapabilitiesGetCurrentResponsePayload {
  readiness: CommunicationReadiness;
}

export interface DevicesUpdatedPayload {
  devices: DeviceSummary[];
}

export interface AudioVisualizerSignal {
  low: number;
  mid: number;
  high: number;
  bass: number;
  lowMids: number;
  mids: number;
  presence: number;
  treble: number;
  air: number;
  vocalPresence: number;
  instrumentPresence: number;
  warmth: number;
  clarity: number;
  brightness: number;
  punch: number;
  transient: number;
  energy: number;
  isActive: boolean;
  capturedAt: string;
}

export const MEDIA_REMOTE_SESSION_STATES = ['unavailable', 'available'] as const;
export type MediaRemoteSessionState = (typeof MEDIA_REMOTE_SESSION_STATES)[number];

export const MEDIA_REMOTE_PLAYBACK_STATES = ['unknown', 'opened', 'changing', 'stopped', 'playing', 'paused'] as const;
export type MediaRemotePlaybackState = (typeof MEDIA_REMOTE_PLAYBACK_STATES)[number];

export const MEDIA_REMOTE_TRANSPORT_COMMANDS = ['play', 'pause', 'toggle-play-pause', 'next', 'previous'] as const;
export type MediaRemoteTransportCommand = (typeof MEDIA_REMOTE_TRANSPORT_COMMANDS)[number];

export const MEDIA_ABSOLUTE_VOLUME_BEHAVIORS = ['unsupported'] as const;
export type MediaAbsoluteVolumeBehavior = (typeof MEDIA_ABSOLUTE_VOLUME_BEHAVIORS)[number];

export interface MediaRemoteSessionMetadata {
  title: string | null;
  artist: string | null;
  albumTitle: string | null;
  albumArtist: string | null;
}

export interface MediaRemoteSessionControls {
  canPlay: boolean;
  canPause: boolean;
  canTogglePlayPause: boolean;
  canNext: boolean;
  canPrevious: boolean;
}

export interface MediaRemoteSessionSnapshot {
  state: MediaRemoteSessionState;
  playbackState: MediaRemotePlaybackState;
  metadata: MediaRemoteSessionMetadata;
  controls: MediaRemoteSessionControls;
  sourceAppUserModelId: string | null;
  detail: string;
  absoluteVolumeBehavior: MediaAbsoluteVolumeBehavior;
  absoluteVolumeDetail: string;
  sessionCount: number;
  updatedAt: string;
}

export interface MediaRemoteSessionGetCurrentResponsePayload {
  session: MediaRemoteSessionSnapshot;
}

export interface MediaRemoteTransportCommandPayload {
  command: MediaRemoteTransportCommand;
}

export interface MediaRemoteTransportCommandResponsePayload {
  session: MediaRemoteSessionSnapshot;
}

export type BridgeRequestMap = {
  'bridge.ping': EmptyPayload;
  'devices.refresh': EmptyPayload;
  'connection.enable': ConnectionCommandPayload;
  'connection.open': ConnectionCommandPayload;
  'connection.release': ConnectionReleasePayload;
  'diagnostics.getRecent': DiagnosticsGetRecentPayload;
  'capabilities.getCurrent': EmptyPayload;
  'media.session.getCurrent': EmptyPayload;
  'media.session.sendCommand': MediaRemoteTransportCommandPayload;
};

export type BridgeResponseMap = {
  'bridge.ping': BridgePingResponsePayload;
  'devices.refresh': DevicesRefreshResponsePayload;
  'connection.enable': ConnectionActionResponsePayload;
  'connection.open': ConnectionActionResponsePayload;
  'connection.release': ConnectionActionResponsePayload;
  'diagnostics.getRecent': DiagnosticsGetRecentResponsePayload;
  'capabilities.getCurrent': CapabilitiesGetCurrentResponsePayload;
  'media.session.getCurrent': MediaRemoteSessionGetCurrentResponsePayload;
  'media.session.sendCommand': MediaRemoteTransportCommandResponsePayload;
};

export type BridgeEventMap = {
  'devices.updated': DevicesUpdatedPayload;
  'connection.stateChanged': ConnectionStateChangedPayload;
  'diagnostics.appended': DiagnosticsEvent;
  'bridge.healthChanged': BridgeHealth;
  'capabilities.updated': CommunicationReadiness;
  'visualizer.signalUpdated': AudioVisualizerSignal;
  'media.sessionUpdated': MediaRemoteSessionSnapshot;
};

export interface BridgeRequest<K extends keyof BridgeRequestMap = keyof BridgeRequestMap> {
  id: string;
  type: K;
  payload: BridgeRequestMap[K];
}

export type BridgeSuccessResponse<K extends keyof BridgeResponseMap = keyof BridgeResponseMap> = {
  requestId: string;
  ok: true;
  payload: BridgeResponseMap[K];
};

export type BridgeErrorResponse = {
  requestId: string;
  ok: false;
  error: UserFacingError;
};

export type BridgeResponse<K extends keyof BridgeResponseMap = keyof BridgeResponseMap> =
  | BridgeSuccessResponse<K>
  | BridgeErrorResponse;

export interface BridgeEvent<K extends keyof BridgeEventMap = keyof BridgeEventMap> {
  type: K;
  payload: BridgeEventMap[K];
}

export type Unsubscribe = () => void;

export interface PhoneToPcSpeakerApi {
  ping: () => Promise<BridgeResponse<'bridge.ping'>>;
  refreshDevices: () => Promise<BridgeResponse<'devices.refresh'>>;
  enableConnection: (deviceId: string) => Promise<BridgeResponse<'connection.enable'>>;
  openConnection: (deviceId: string) => Promise<BridgeResponse<'connection.open'>>;
  releaseConnection: (deviceId: string | null) => Promise<BridgeResponse<'connection.release'>>;
  getRecentDiagnostics: (limit?: number) => Promise<BridgeResponse<'diagnostics.getRecent'>>;
  getCapabilities: () => Promise<BridgeResponse<'capabilities.getCurrent'>>;
  getMediaRemoteSession: () => Promise<BridgeResponse<'media.session.getCurrent'>>;
  sendMediaRemoteCommand: (command: MediaRemoteTransportCommand) => Promise<BridgeResponse<'media.session.sendCommand'>>;
  getDesktopShellInfo: () => Promise<DesktopShellInfo>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  onDevicesUpdated: (listener: (payload: DevicesUpdatedPayload) => void) => Unsubscribe;
  onConnectionStateChanged: (listener: (payload: ConnectionStateChangedPayload) => void) => Unsubscribe;
  onDiagnosticsAppended: (listener: (payload: DiagnosticsEvent) => void) => Unsubscribe;
  onBridgeHealthChanged: (listener: (payload: BridgeHealth) => void) => Unsubscribe;
  onCapabilitiesUpdated: (listener: (payload: CommunicationReadiness) => void) => Unsubscribe;
  onAudioVisualizerSignalUpdated: (listener: (payload: AudioVisualizerSignal) => void) => Unsubscribe;
  onMediaRemoteSessionUpdated: (listener: (payload: MediaRemoteSessionSnapshot) => void) => Unsubscribe;
  onDesktopWindowStateChanged: (listener: (payload: DesktopWindowStateChangedPayload) => void) => Unsubscribe;
}

export function createIdleAudioVisualizerSignal(): AudioVisualizerSignal {
  return {
    low: 0,
    mid: 0,
    high: 0,
    bass: 0,
    lowMids: 0,
    mids: 0,
    presence: 0,
    treble: 0,
    air: 0,
    vocalPresence: 0,
    instrumentPresence: 0,
    warmth: 0,
    clarity: 0,
    brightness: 0,
    punch: 0,
    transient: 0,
    energy: 0,
    isActive: false,
    capturedAt: new Date().toISOString()
  };
}

export function createEmptyDiagnosticsSnapshot(): DiagnosticsSnapshot {
  return {
    summary: [],
    advanced: []
  };
}

export function createUnavailableMediaRemoteSessionSnapshot(
  detail = 'Track info and remote controls appear only when Windows exposes the connected phone as the current media session.'
): MediaRemoteSessionSnapshot {
  return {
    state: 'unavailable',
    playbackState: 'unknown',
    metadata: {
      title: null,
      artist: null,
      albumTitle: null,
      albumArtist: null
    },
    controls: {
      canPlay: false,
      canPause: false,
      canTogglePlayPause: false,
      canNext: false,
      canPrevious: false
    },
    sourceAppUserModelId: null,
    detail,
    absoluteVolumeBehavior: 'unsupported',
    absoluteVolumeDetail: 'AudioPlaybackConnection does not expose AVRCP absolute-volume hooks or remote volume callbacks on the current path.',
    sessionCount: 0,
    updatedAt: new Date().toISOString()
  };
}

export function createDefaultConnectionSnapshot(detail = 'Waiting for bridge health.'): ConnectionSnapshot {
  return {
    state: 'Disconnected',
    activity: 'none',
    deviceId: null,
    detail,
    updatedAt: new Date().toISOString()
  };
}

export function createUnknownCommunicationReadiness(reason = 'Capability probe has not completed yet.'): CommunicationReadiness {
  return {
    mediaAudio: {
      state: 'unknown',
      reason: reason
    },
    callAudio: {
      state: 'unknown',
      reason: 'Call audio has not been validated.'
    },
    bridgeHealth: 'degraded',
    platformReadiness: 'unknown',
    hardwareReadiness: 'unknown',
    confidence: 'low',
    readinessReason: reason,
    currentLimitation: 'Readiness has not been established yet.',
    readinessDetails: null,
    checkedAt: new Date().toISOString()
  };
}

export function isBridgeResponseOk<K extends keyof BridgeResponseMap>(
  response: BridgeResponse<K>
): response is BridgeSuccessResponse<K> {
  return response.ok;
}
