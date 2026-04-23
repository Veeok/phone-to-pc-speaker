import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  APP_TITLE,
  BUTTON_LABELS,
  PANEL_LABELS,
  createIdleAudioVisualizerSignal,
  createDefaultConnectionSnapshot,
  createEmptyDiagnosticsSnapshot,
  createUnavailableMediaRemoteSessionSnapshot,
  createUnknownCommunicationReadiness,
  isBridgeResponseOk,
  type AudioVisualizerSignal,
  type BridgeHealth,
  type CommunicationReadiness,
  type ConnectionActivity,
  type DeviceSummary,
  type DiagnosticsEvent,
  type DiagnosticsSnapshot,
  type MediaRemotePlaybackState,
  type MediaRemoteSessionSnapshot,
  type MediaRemoteTransportCommand,
  type SummaryDiagnosticEntry,
  type PhoneToPcSpeakerApi,
  type UserFacingError
} from '@phone-to-pc-speaker/shared-types';
import {
  AppIcon,
  CheckIcon,
  CloseIcon,
  ConnectIcon,
  HelpIcon,
  MaximizeIcon,
  MinimizeIcon,
  MusicIcon,
  NextTrackIcon,
  PauseIcon,
  PhoneIcon,
  PlayIcon,
  PreviousTrackIcon,
  ReleaseIcon,
  RestoreIcon,
  SearchIcon,
  SparkIcon,
  WarningIcon
} from './icons';
import { AudioRibbonVisualizer, VISUALIZER_PROFILES, type VisualizerProfileId } from './AudioRibbonVisualizer';

type StatusTone = 'good' | 'warning' | 'bad' | 'neutral';

const SELECTED_DEVICE_STORAGE_KEY = 'phone-to-pc-speaker.selected-device-id';
const VISUALIZER_PROFILE_STORAGE_KEY = 'phone-to-pc-speaker.visualizer-profile';

function createInitialBridgeHealth(): BridgeHealth {
  return {
    status: 'starting',
    reason: 'Waiting for bridge health.',
    checkedAt: new Date().toISOString(),
    bridgePath: null
  };
}

function createRendererError(
  code: UserFacingError['code'],
  message: string,
  suggestedAction?: string | null
): UserFacingError {
  return {
    code,
    message,
    recoverable: true,
    suggestedAction: suggestedAction ?? null
  };
}

function appendDiagnostics(currentSnapshot: DiagnosticsSnapshot, nextEvent: DiagnosticsEvent): DiagnosticsSnapshot {
  const summary = [...currentSnapshot.summary, nextEvent.summary].slice(-200);
  const removedSummaryIds = new Set(
    currentSnapshot.summary
      .slice(0, Math.max(currentSnapshot.summary.length + 1 - 200, 0))
      .map((entry) => entry.id)
  );
  const advancedEntries = nextEvent.advanced === null ? currentSnapshot.advanced : [...currentSnapshot.advanced, nextEvent.advanced];
  const advanced = advancedEntries
    .filter((entry) => !removedSummaryIds.has(entry.summaryId))
    .slice(-200);

  return { summary, advanced };
}

function isManualVolumeTestDiagnostic(entry: SummaryDiagnosticEntry): boolean {
  return entry.title === 'Manual volume test is available during playback.';
}

function VisualizerDiagnosticsProbe({ api, connected }: { api: PhoneToPcSpeakerApi | null; connected: boolean }) {
  const latestSignalRef = useRef<AudioVisualizerSignal>(createIdleAudioVisualizerSignal());
  const [displaySignal, setDisplaySignal] = useState<AudioVisualizerSignal>(() => createIdleAudioVisualizerSignal());

  useEffect(() => {
    latestSignalRef.current = createIdleAudioVisualizerSignal();
    setDisplaySignal(createIdleAudioVisualizerSignal());

    if (api === null) {
      return;
    }

    return api.onAudioVisualizerSignalUpdated((payload) => {
      latestSignalRef.current = { ...createIdleAudioVisualizerSignal(), ...payload };
    });
  }, [api]);

  useEffect(() => {
    if (!connected) {
      const idleSignal = createIdleAudioVisualizerSignal();
      latestSignalRef.current = idleSignal;
      setDisplaySignal(idleSignal);
      return;
    }

    const intervalId = window.setInterval(() => {
      setDisplaySignal({ ...createIdleAudioVisualizerSignal(), ...latestSignalRef.current });
    }, 260);

    return () => window.clearInterval(intervalId);
  }, [connected]);

  const normalizedSignal = {
    low: normalizeProbeMetric(displaySignal.low),
    mid: normalizeProbeMetric(displaySignal.mid),
    high: normalizeProbeMetric(displaySignal.high),
    bass: normalizeProbeMetric(displaySignal.bass),
    lowMids: normalizeProbeMetric(displaySignal.lowMids),
    mids: normalizeProbeMetric(displaySignal.mids),
    presence: normalizeProbeMetric(displaySignal.presence),
    treble: normalizeProbeMetric(displaySignal.treble),
    air: normalizeProbeMetric(displaySignal.air),
    vocalPresence: normalizeProbeMetric(displaySignal.vocalPresence),
    instrumentPresence: normalizeProbeMetric(displaySignal.instrumentPresence),
    warmth: normalizeProbeMetric(displaySignal.warmth),
    clarity: normalizeProbeMetric(displaySignal.clarity),
    brightness: normalizeProbeMetric(displaySignal.brightness),
    punch: normalizeProbeMetric(displaySignal.punch),
    transient: normalizeProbeMetric(displaySignal.transient),
    energy: normalizeProbeMetric(displaySignal.energy)
  };

  const strongestBand = (() => {
    const bands: Array<{ label: 'Low' | 'Mid' | 'High'; value: number }> = [
      { label: 'Low', value: normalizedSignal.low },
      { label: 'Mid', value: normalizedSignal.mid },
      { label: 'High', value: normalizedSignal.high }
    ];
    let strongest: { label: 'Low' | 'Mid' | 'High'; value: number } = { label: 'Low', value: normalizedSignal.low };

    for (const band of bands) {
      if (band.value > strongest.value) {
        strongest = band;
      }
    }

    return strongest.value < 0.08 ? 'Idle / very soft' : `${strongest.label}-led`;
  })();

  const technicalMetrics = [
    { label: 'Low', value: normalizedSignal.low, title: 'Technical summary band for low-frequency energy.' },
    { label: 'Mid', value: normalizedSignal.mid, title: 'Technical summary band for mid-frequency energy.' },
    { label: 'High', value: normalizedSignal.high, title: 'Technical summary band for high-frequency energy.' },
    { label: 'Transient', value: normalizedSignal.transient, title: 'Transient emphasis estimate from rising spectral energy.' },
    { label: 'Energy', value: normalizedSignal.energy, title: 'Overall smoothed playback energy.' }
  ];

  const eqMetrics = [
    { label: 'Bass', value: normalizedSignal.bass, title: 'Direct spectral band: 20 to 250 Hz.' },
    { label: 'Low mids', value: normalizedSignal.lowMids, title: 'Direct spectral band: 250 to 500 Hz.' },
    { label: 'Mids', value: normalizedSignal.mids, title: 'Direct spectral band: 500 Hz to 2 kHz.' },
    { label: 'Presence', value: normalizedSignal.presence, title: 'Direct spectral band: 2 kHz to 6 kHz.' },
    { label: 'Treble', value: normalizedSignal.treble, title: 'Direct spectral band: 6 kHz to 12 kHz.' },
    { label: 'Air', value: normalizedSignal.air, title: 'Direct spectral band: 12 kHz to 20 kHz when the output format supports it.' }
  ];

  const descriptorMetrics = [
    { label: 'Vocal', value: normalizedSignal.vocalPresence, title: 'Estimated descriptor from weighted 1 kHz to 4 kHz energy. This does not isolate vocals.' },
    { label: 'Instrument', value: normalizedSignal.instrumentPresence, title: 'Estimated descriptor from weighted 300 Hz to 5 kHz harmonic energy. This does not isolate instruments.' },
    { label: 'Warmth', value: normalizedSignal.warmth, title: 'Derived warmth estimate emphasizing roughly 150 Hz to 400 Hz.' },
    { label: 'Clarity', value: normalizedSignal.clarity, title: 'Derived clarity estimate emphasizing roughly 2 kHz to 6 kHz.' },
    { label: 'Brightness', value: normalizedSignal.brightness, title: 'Derived brightness estimate emphasizing roughly 6 kHz to 12 kHz.' },
    { label: 'Punch', value: normalizedSignal.punch, title: 'Derived punch estimate emphasizing roughly 60 Hz to 120 Hz plus transient activity.' }
  ];

  return (
    <div className="advanced-row advanced-row--probe">
      <div className="probe-section">
        <div className="probe-section__header">
          <strong>Live frequency probe</strong>
          <span className="probe-section__tag">Technical bands</span>
        </div>
        <p>
          {connected
            ? 'Play bass-heavy, vocal-heavy, and bright material to confirm the analyzer separates broad frequency regions on your hardware.'
            : 'Connect and play audio to inspect live low / mid / high separation.'}
        </p>
        <div className="probe-metrics" role="group" aria-label="Technical frequency metrics">
          {technicalMetrics.map((metric) => (
            <span key={metric.label} title={metric.title}>
              {metric.label} {formatProbeValue(metric.value)}
            </span>
          ))}
        </div>
        <p className="probe-note">Current emphasis: {strongestBand}</p>
      </div>

      <div className="probe-section">
        <div className="probe-section__header">
          <strong>Sound character</strong>
          <span
            className="probe-section__tag probe-section__tag--estimated"
            title="Vocal and instrument values are estimated descriptors derived from weighted band energy. They do not isolate separate sources."
          >
            Estimated descriptors
          </span>
        </div>
        <div className="probe-metrics" role="group" aria-label="Equalizer-style spectral bands">
          {eqMetrics.map((metric) => (
            <span key={metric.label} title={metric.title}>
              {metric.label} {formatProbeValue(metric.value)}
            </span>
          ))}
        </div>
        <div className="probe-metrics probe-metrics--derived" role="group" aria-label="Listener-friendly sound character descriptors">
          {descriptorMetrics.map((metric) => (
            <span key={metric.label} title={metric.title}>
              {metric.label} {formatProbeValue(metric.value)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatProbeValue(value: number): string {
  return `${Math.round(normalizeProbeMetric(value) * 100)}%`;
}

function normalizeProbeMetric(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(value, 1)) : 0;
}

function getConnectionTone(state: ReturnType<typeof createDefaultConnectionSnapshot>['state']): StatusTone {
  switch (state) {
    case 'Connected':
    case 'Ready':
      return 'good';
    case 'Connecting':
      return 'warning';
    case 'Failed':
      return 'bad';
    default:
      return 'neutral';
  }
}

function getConnectionProgress(state: ReturnType<typeof createDefaultConnectionSnapshot>['state']): number {
  switch (state) {
    case 'Disconnected':
      return 10;
    case 'Ready':
      return 45;
    case 'Connecting':
      return 72;
    case 'Connected':
      return 100;
    case 'Failed':
      return 24;
    default:
      return 0;
  }
}

function getDeviceStatusLine(device: DeviceSummary, isSelected: boolean, connectionState: ReturnType<typeof createDefaultConnectionSnapshot>['state']): string {
  if (isSelected && connectionState === 'Connected') {
    return 'Audio is currently connected.';
  }

  if (isSelected && connectionState === 'Ready') {
    return 'Almost ready. Opening the audio route next.';
  }

  if (isSelected && connectionState === 'Failed') {
    return 'Connection did not finish. Try again or open Troubleshoot.';
  }

  if (device.canConnect && device.isPaired) {
    return hasTrustworthyNearbySignal(device) ? 'Nearby and already linked through Windows.' : 'Ready to connect.';
  }

  if (device.canConnect) {
    return 'Visible now, but Bluetooth pairing may need attention.';
  }

  return 'Not available right now.';
}

function getDeviceTone(device: DeviceSummary, isSelected: boolean, connectionState: ReturnType<typeof createDefaultConnectionSnapshot>['state']): StatusTone {
  if (hasTrustworthyNearbySignal(device)) {
    return 'good';
  }

  if (isSelected && connectionState === 'Connected') {
    return 'good';
  }

  if (isSelected && connectionState === 'Failed') {
    return 'bad';
  }

  if (device.canConnect && device.isPaired) {
    return 'good';
  }

  if (device.canConnect) {
    return 'warning';
  }

  return 'neutral';
}

function getDeviceBadgeText(device: DeviceSummary, isSelected: boolean): string {
  if (isSelected) {
    return 'Selected';
  }

  if (hasTrustworthyNearbySignal(device)) {
    return 'Nearby';
  }

  if (device.canConnect && device.isPaired) {
    return 'Ready';
  }

  if (device.canConnect) {
    return 'Check Bluetooth';
  }

  return 'Unavailable';
}

function hasTrustworthyNearbySignal(device: DeviceSummary): boolean {
  return device.isConnected && (device.batteryPercent !== null || device.manufacturer !== null || device.modelName !== null);
}

function sortDevices(devices: DeviceSummary[], selectedDeviceId: string | null): DeviceSummary[] {
  return [...devices].sort((left, right) => {
    if (left.id === selectedDeviceId) {
      return -1;
    }

    if (right.id === selectedDeviceId) {
      return 1;
    }

    if (hasTrustworthyNearbySignal(left) !== hasTrustworthyNearbySignal(right)) {
      return hasTrustworthyNearbySignal(left) ? -1 : 1;
    }

    if (left.canConnect !== right.canConnect) {
      return left.canConnect ? -1 : 1;
    }

    return new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime();
  });
}

function matchesDeviceSearch(device: DeviceSummary, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return true;
  }

  return `${device.name} ${device.id}`.toLowerCase().includes(normalizedQuery);
}

function normalizeDeviceSummary(device: DeviceSummary): DeviceSummary {
  return {
    ...device,
    batteryPercent: typeof device.batteryPercent === 'number' ? device.batteryPercent : null,
    manufacturer: device.manufacturer ?? null,
    modelName: device.modelName ?? null
  };
}

function normalizeDeviceSummaries(devices: DeviceSummary[]): DeviceSummary[] {
  return devices.map(normalizeDeviceSummary);
}

function hasRemoteMediaMetadata(session: MediaRemoteSessionSnapshot): boolean {
  return session.metadata.title !== null || session.metadata.artist !== null || session.metadata.albumTitle !== null;
}

function hasRemoteMediaControls(session: MediaRemoteSessionSnapshot): boolean {
  return session.controls.canPlay || session.controls.canPause || session.controls.canTogglePlayPause || session.controls.canNext || session.controls.canPrevious;
}

function shouldShowRemoteMediaCard(
  session: MediaRemoteSessionSnapshot,
  connectionState: ReturnType<typeof createDefaultConnectionSnapshot>['state']
): boolean {
  return connectionState === 'Connected' && session.state === 'available' && (hasRemoteMediaMetadata(session) || hasRemoteMediaControls(session));
}

function getRemoteMediaTone(session: MediaRemoteSessionSnapshot): StatusTone {
  switch (session.playbackState) {
    case 'playing':
      return 'good';
    case 'paused':
    case 'opened':
    case 'stopped':
      return 'neutral';
    case 'changing':
      return 'warning';
    default:
      return session.state === 'available' ? 'neutral' : 'warning';
  }
}

function getRemotePlaybackLabel(playbackState: MediaRemotePlaybackState): string {
  switch (playbackState) {
    case 'playing':
      return 'Playing';
    case 'paused':
      return 'Paused';
    case 'stopped':
      return 'Stopped';
    case 'changing':
      return 'Changing';
    case 'opened':
      return 'Ready';
    default:
      return 'Waiting';
  }
}

function getRemoteMediaTitle(session: MediaRemoteSessionSnapshot): string {
  return session.metadata.title ?? 'Phone media session';
}

function getRemoteMediaSubtitle(session: MediaRemoteSessionSnapshot): string {
  const primaryParts = [session.metadata.artist, session.metadata.albumTitle].filter((value): value is string => value !== null && value.trim().length > 0);
  if (primaryParts.length > 0) {
    return primaryParts.join(' • ');
  }

  return session.detail;
}

function getRemotePrimaryCommand(session: MediaRemoteSessionSnapshot): MediaRemoteTransportCommand | null {
  if (session.controls.canTogglePlayPause) {
    return 'toggle-play-pause';
  }

  if (session.playbackState === 'playing' && session.controls.canPause) {
    return 'pause';
  }

  if (session.controls.canPlay) {
    return 'play';
  }

  if (session.controls.canPause) {
    return 'pause';
  }

  return null;
}

function getRemotePrimaryCommandLabel(command: MediaRemoteTransportCommand | null, playbackState: MediaRemotePlaybackState): string {
  if (command === 'toggle-play-pause') {
    return playbackState === 'playing' ? 'Pause' : 'Play';
  }

  if (command === 'pause') {
    return 'Pause';
  }

  if (command === 'play') {
    return 'Play';
  }

  return 'Play or pause';
}

function isBusyActivity(activity: ConnectionActivity): boolean {
  return activity !== 'none' && activity !== 'loading-diagnostics';
}

function getEffectiveScaleFactor(runtimeDevicePixelRatio: number, shellScaleFactor: number | null): number {
  if (Number.isFinite(runtimeDevicePixelRatio) && runtimeDevicePixelRatio > 0) {
    return runtimeDevicePixelRatio;
  }

  if (shellScaleFactor !== null && Number.isFinite(shellScaleFactor) && shellScaleFactor > 0) {
    return shellScaleFactor;
  }

  return 1;
}

function getDensityProfile(scaleFactor: number): 'compact' | 'normal' | 'spacious' {
  if (scaleFactor >= 1.7) {
    return 'compact';
  }

  if (scaleFactor <= 1.1) {
    return 'spacious';
  }

  return 'normal';
}

function getUiScale(scaleFactor: number): number {
  const clampedScaleFactor = Math.min(Math.max(scaleFactor, 1), 2);
  const scaledValue = 0.98 - ((clampedScaleFactor - 1) * 0.1);
  return Math.max(0.88, Math.min(0.98, Number(scaledValue.toFixed(3))));
}

function getApi(): PhoneToPcSpeakerApi | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return typeof window.phoneToPcSpeaker === 'undefined' ? null : window.phoneToPcSpeaker;
}

function readRememberedDeviceId(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_DEVICE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRememberedDeviceId(value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(SELECTED_DEVICE_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(SELECTED_DEVICE_STORAGE_KEY, value);
  } catch {
    // Ignore local storage failures so the UI still renders.
  }
}

function isVisualizerProfileId(value: string | null): value is VisualizerProfileId {
  return VISUALIZER_PROFILES.some((profile) => profile.id === value);
}

function readRememberedVisualizerProfile(): VisualizerProfileId {
  try {
    const storedValue = window.localStorage.getItem(VISUALIZER_PROFILE_STORAGE_KEY);
    return isVisualizerProfileId(storedValue) ? storedValue : 'balanced';
  } catch {
    return 'balanced';
  }
}

function writeRememberedVisualizerProfile(value: VisualizerProfileId): void {
  try {
    window.localStorage.setItem(VISUALIZER_PROFILE_STORAGE_KEY, value);
  } catch {
    // Ignore local storage failures so the UI still renders.
  }
}

function Signal({ tone }: { tone: StatusTone }) {
  return <span aria-hidden="true" className={`signal signal--${tone}`} />;
}

function ButtonActivityDots() {
  return (
    <span aria-hidden="true" className="button-activity-dots">
      <span />
      <span />
      <span />
    </span>
  );
}

function MediaTransportButton({
  label,
  onClick,
  disabled,
  emphasized,
  children
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  emphasized?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className={`media-transport-button${emphasized ? ' media-transport-button--emphasized' : ''}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ConnectionIndicator({
  state,
  activity,
  pulseState
}: {
  state: ReturnType<typeof createDefaultConnectionSnapshot>['state'];
  activity: ConnectionActivity;
  pulseState: 'connected' | 'failed' | null;
}) {
  const isConnecting = activity === 'enabling-connection' || activity === 'opening-connection' || state === 'Connecting';

  if (isConnecting) {
    return (
      <div className="connection-indicator connection-indicator--connecting" aria-live="polite">
        <div className="connection-indicator__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <strong>Connecting</strong>
      </div>
    );
  }

  if (state === 'Connected') {
    return (
      <div className={`connection-indicator connection-indicator--connected${pulseState === 'connected' ? ' connection-indicator--pulse' : ''}`} aria-live="polite">
        <span className="connection-indicator__icon" aria-hidden="true">
          <CheckIcon />
        </span>
        <strong>Connected</strong>
      </div>
    );
  }

  if (state === 'Failed') {
    return (
      <div className={`connection-indicator connection-indicator--failed${pulseState === 'failed' ? ' connection-indicator--pulse' : ''} connection-indicator--alert`} aria-live="polite">
        <span className="connection-indicator__icon" aria-hidden="true">
          <WarningIcon />
        </span>
        <strong>Check connection</strong>
      </div>
    );
  }

  return (
    <div className="connection-indicator connection-indicator--idle" aria-live="polite">
      <span className="connection-indicator__icon" aria-hidden="true">
        <Signal tone={state === 'Ready' ? 'good' : 'neutral'} />
      </span>
      <strong>{state === 'Ready' ? 'Ready' : 'Waiting'}</strong>
    </div>
  );
}

export function App() {
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(() => readRememberedDeviceId());
  const [visualizerProfile, setVisualizerProfile] = useState<VisualizerProfileId>(() => readRememberedVisualizerProfile());
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [uiMotionPaused, setUiMotionPaused] = useState(() => document.hidden || !document.hasFocus());
  const [feedbackPulse, setFeedbackPulse] = useState<'connected' | 'failed' | null>(null);
  const [buttonMorph, setButtonMorph] = useState(false);
  const [selectionPulseId, setSelectionPulseId] = useState<string | null>(null);
  const [bridgeHealth, setBridgeHealth] = useState<BridgeHealth>(createInitialBridgeHealth);
  const [connectionSnapshot, setConnectionSnapshot] = useState(createDefaultConnectionSnapshot());
  const [readiness, setReadiness] = useState<CommunicationReadiness>(() => createUnknownCommunicationReadiness('Waiting for capability probe results.'));
  const [mediaRemoteSession, setMediaRemoteSession] = useState<MediaRemoteSessionSnapshot>(() => createUnavailableMediaRemoteSessionSnapshot());
  const [lastError, setLastError] = useState<UserFacingError | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsSnapshot>(createEmptyDiagnosticsSnapshot);
  const [pendingActivity, setPendingActivity] = useState<ConnectionActivity>('loading-diagnostics');
  const [pendingMediaCommand, setPendingMediaCommand] = useState<MediaRemoteTransportCommand | null>(null);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(true);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [deviceQuery, setDeviceQuery] = useState('');
  const [displayScaleFactor, setDisplayScaleFactor] = useState<number>(() => getEffectiveScaleFactor(window.devicePixelRatio, null));
  const [densityProfile, setDensityProfile] = useState<'compact' | 'normal' | 'spacious'>(() => getDensityProfile(getEffectiveScaleFactor(window.devicePixelRatio, null)));
  const [uiScale, setUiScale] = useState<number>(() => getUiScale(getEffectiveScaleFactor(window.devicePixelRatio, null)));
  const previousConnectionStateRef = useRef(connectionSnapshot.state);
  const previousSelectedDeviceIdRef = useRef<string | null>(selectedDeviceId);
  const previousPrimaryLabelRef = useRef<string | null>(null);

  const api = getApi();
  const selectedDevice = useMemo(() => devices.find((device) => device.id === selectedDeviceId) ?? null, [devices, selectedDeviceId]);
  const sortedDevices = useMemo(() => sortDevices(devices, selectedDeviceId), [devices, selectedDeviceId]);
  const filteredDevices = useMemo(() => sortedDevices.filter((device) => matchesDeviceSearch(device, deviceQuery)), [deviceQuery, sortedDevices]);
  const summaryDiagnostics = useMemo(() => [...diagnostics.summary].reverse(), [diagnostics.summary]);
  const advancedDiagnostics = useMemo(() => [...diagnostics.advanced].reverse(), [diagnostics.advanced]);
  const currentActivity = pendingActivity !== 'none' ? pendingActivity : connectionSnapshot.activity;
  const actionInFlight = isBusyActivity(pendingActivity);
  const bridgeReady = bridgeHealth.status === 'healthy';
  const primaryMediaCommand = getRemotePrimaryCommand(mediaRemoteSession);
  const showRemoteMediaCard = shouldShowRemoteMediaCard(mediaRemoteSession, connectionSnapshot.state);

  const canRefreshDevices = bridgeReady && !actionInFlight && api !== null;
  const canOpenConnection = bridgeReady && !actionInFlight && api !== null && selectedDeviceId !== null && connectionSnapshot.state === 'Ready';
  const canReleaseConnection =
    bridgeReady &&
    !actionInFlight &&
    api !== null &&
    (selectedDeviceId !== null || connectionSnapshot.state !== 'Disconnected') &&
    (connectionSnapshot.state === 'Ready' ||
      connectionSnapshot.state === 'Connecting' ||
      connectionSnapshot.state === 'Connected' ||
      connectionSnapshot.state === 'Failed');

  useEffect(() => {
    writeRememberedDeviceId(selectedDeviceId);
  }, [selectedDeviceId]);

  useEffect(() => {
    writeRememberedVisualizerProfile(visualizerProfile);
  }, [visualizerProfile]);

  useEffect(() => {
    if (sortedDevices.length === 0) {
      if (selectedDeviceId !== null) {
        setSelectedDeviceId(null);
      }
      return;
    }

    const selectedStillExists = selectedDeviceId !== null && sortedDevices.some((device) => device.id === selectedDeviceId);
    if (selectedStillExists) {
      return;
    }

    const preferredDevice = sortedDevices.find((device) => device.canConnect) ?? sortedDevices[0] ?? null;
    if (preferredDevice !== null && preferredDevice.id !== selectedDeviceId) {
      setSelectedDeviceId(preferredDevice.id);
    }
  }, [selectedDeviceId, sortedDevices]);

  useEffect(() => {
    if (selectedDeviceId === null || previousSelectedDeviceIdRef.current === selectedDeviceId) {
      previousSelectedDeviceIdRef.current = selectedDeviceId;
      return;
    }

    previousSelectedDeviceIdRef.current = selectedDeviceId;
    setSelectionPulseId(selectedDeviceId);

    const timeoutId = window.setTimeout(() => {
      setSelectionPulseId((currentValue) => (currentValue === selectedDeviceId ? null : currentValue));
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [selectedDeviceId]);

  const syncDisplayScale = useCallback((shellScaleFactor: number | null = null) => {
    const effectiveScaleFactor = getEffectiveScaleFactor(window.devicePixelRatio, shellScaleFactor ?? displayScaleFactor);
    setDisplayScaleFactor(effectiveScaleFactor);
    setDensityProfile(getDensityProfile(effectiveScaleFactor));
    setUiScale(getUiScale(effectiveScaleFactor));
  }, [displayScaleFactor]);

  useEffect(() => {
    syncDisplayScale();

    let resolutionMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);

    const handleScaleChange = () => {
      syncDisplayScale();
      resolutionMediaQuery.removeEventListener('change', handleScaleChange);
      resolutionMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      resolutionMediaQuery.addEventListener('change', handleScaleChange);
    };

    const handleViewportResize = () => {
      syncDisplayScale();
    };

    window.addEventListener('resize', handleScaleChange);
    window.visualViewport?.addEventListener('resize', handleViewportResize);
    resolutionMediaQuery.addEventListener('change', handleScaleChange);

    return () => {
      window.removeEventListener('resize', handleScaleChange);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      resolutionMediaQuery.removeEventListener('change', handleScaleChange);
    };
  }, [syncDisplayScale]);

  useEffect(() => {
    function handleVisibilityChange() {
      setUiMotionPaused(document.hidden || !document.hasFocus());
    }

    function handleWindowBlur() {
      setUiMotionPaused(true);
    }

    function handleWindowFocus() {
      setUiMotionPaused(document.hidden || !document.hasFocus());
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  useEffect(() => {
    const previousState = previousConnectionStateRef.current;
    if (previousState === connectionSnapshot.state) {
      return;
    }

    previousConnectionStateRef.current = connectionSnapshot.state;

    if (connectionSnapshot.state !== 'Connected' && connectionSnapshot.state !== 'Failed') {
      setFeedbackPulse(null);
      return;
    }

    const pulseValue = connectionSnapshot.state === 'Connected' ? 'connected' : 'failed';
    setFeedbackPulse(pulseValue);

    const timeoutId = window.setTimeout(() => {
      setFeedbackPulse((currentValue) => (currentValue === pulseValue ? null : currentValue));
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [connectionSnapshot.state]);

  useEffect(() => {
    if (api === null) {
      return;
    }

    void api.getDesktopShellInfo().then((info) => {
      setAppVersion(info.version);
      setIsWindowMaximized(info.isMaximized);
      syncDisplayScale(info.scaleFactor);
    });

    return api.onDesktopWindowStateChanged((payload) => {
      setIsWindowMaximized(payload.isMaximized);
      syncDisplayScale(payload.scaleFactor);
    });
  }, [api, syncDisplayScale]);

  useEffect(() => {
    if (api === null) {
      setIsBootstrapping(false);
      setIsLoadingDiagnostics(false);
      setPendingActivity('none');
          setLastError(
            createRendererError(
              'INTERNAL_ERROR',
              'The preload bridge API is not available in the renderer.',
              'Restart the desktop app and verify the preload bridge is loaded.'
            )
      );
      return;
    }

    let disposed = false;

    const removeDevicesUpdated = api.onDevicesUpdated((payload) => {
      if (!disposed) {
        setDevices(normalizeDeviceSummaries(payload.devices));
      }
    });

    const removeConnectionStateChanged = api.onConnectionStateChanged((payload) => {
      if (!disposed) {
        setConnectionSnapshot(payload);
      }
    });

    const removeDiagnosticsAppended = api.onDiagnosticsAppended((payload) => {
      if (!disposed) {
        setDiagnostics((currentDiagnostics) => appendDiagnostics(currentDiagnostics, payload));
      }
    });

    const removeBridgeHealthChanged = api.onBridgeHealthChanged((payload) => {
      if (disposed) {
        return;
      }

      setBridgeHealth(payload);
      if (payload.status !== 'healthy' && payload.reason !== null) {
        setLastError(createRendererError('BRIDGE_UNAVAILABLE', payload.reason, 'Build or relaunch the Windows bridge, then refresh devices.'));
      }
    });

    const removeCapabilitiesUpdated = api.onCapabilitiesUpdated((payload) => {
      if (!disposed) {
        setReadiness(payload);
      }
    });

    const removeMediaRemoteSessionUpdated = api.onMediaRemoteSessionUpdated((payload) => {
      if (!disposed) {
        setMediaRemoteSession(payload);
      }
    });

    void (async () => {
      try {
        setIsBootstrapping(true);
        setIsLoadingDiagnostics(true);

        const [pingResponse, capabilitiesResponse, diagnosticsResponse, mediaRemoteSessionResponse] = await Promise.all([
          api.ping(),
          api.getCapabilities(),
          api.getRecentDiagnostics(120),
          api.getMediaRemoteSession()
        ]);

        if (disposed) {
          return;
        }

        if (isBridgeResponseOk(pingResponse)) {
          setBridgeHealth(pingResponse.payload.health);
        } else {
          setLastError(pingResponse.error);
        }

        if (isBridgeResponseOk(capabilitiesResponse)) {
          setReadiness(capabilitiesResponse.payload.readiness);
        } else {
          setLastError(capabilitiesResponse.error);
        }

        if (isBridgeResponseOk(diagnosticsResponse)) {
          setDiagnostics(diagnosticsResponse.payload.diagnostics);
        } else {
          setLastError(diagnosticsResponse.error);
        }

        if (isBridgeResponseOk(mediaRemoteSessionResponse)) {
          setMediaRemoteSession(mediaRemoteSessionResponse.payload.session);
        }

        setIsLoadingDiagnostics(false);
        setPendingActivity('none');

        if (isBridgeResponseOk(pingResponse) && pingResponse.payload.health.status === 'healthy') {
          setPendingActivity('refreshing-devices');
          const refreshResponse = await api.refreshDevices();

          if (disposed) {
            return;
          }

          if (isBridgeResponseOk(refreshResponse)) {
            setDevices(normalizeDeviceSummaries(refreshResponse.payload.devices));
            setLastError(null);
          } else {
            setLastError(refreshResponse.error);
          }

          setPendingActivity('none');
        }
      } catch (error) {
        if (!disposed) {
          setLastError(
            createRendererError(
              'INTERNAL_ERROR',
              error instanceof Error ? error.message : 'Renderer bootstrap failed.',
              'Check the preload bridge and the renderer console for details.'
            )
          );
          setIsLoadingDiagnostics(false);
          setPendingActivity('none');
        }
      } finally {
        if (!disposed) {
          setIsBootstrapping(false);
        }
      }
    })();

    return () => {
      disposed = true;
      removeDevicesUpdated();
      removeConnectionStateChanged();
      removeDiagnosticsAppended();
      removeBridgeHealthChanged();
      removeCapabilitiesUpdated();
      removeMediaRemoteSessionUpdated();
    };
  }, [api]);

  const runWithActivity = useCallback(async (activity: ConnectionActivity, work: () => Promise<void>): Promise<void> => {
    if (api === null || isBusyActivity(pendingActivity)) {
      return;
    }

    setPendingActivity(activity);
    try {
      await work();
    } catch (error) {
      setLastError(
        createRendererError(
          'INTERNAL_ERROR',
          error instanceof Error ? error.message : 'The requested action failed.',
          'Retry the action or inspect diagnostics for more detail.'
        )
      );
    } finally {
      setPendingActivity('none');
    }
  }, [api, pendingActivity]);

  const handleRefreshDevices = useCallback(async (): Promise<void> => {
    if (!canRefreshDevices || api === null) {
      return;
    }

    await runWithActivity('refreshing-devices', async () => {
      const response = await api.refreshDevices();
      if (isBridgeResponseOk(response)) {
        setDevices(normalizeDeviceSummaries(response.payload.devices));
        setLastError(null);
        return;
      }

      setLastError(response.error);
    });
  }, [api, canRefreshDevices, runWithActivity]);

  const handleMediaRemoteCommand = useCallback(async (command: MediaRemoteTransportCommand): Promise<void> => {
    if (api === null || pendingMediaCommand !== null || connectionSnapshot.state !== 'Connected') {
      return;
    }

    setPendingMediaCommand(command);
    try {
      const response = await api.sendMediaRemoteCommand(command);
      if (isBridgeResponseOk(response)) {
        setMediaRemoteSession(response.payload.session);
        setLastError(null);
        return;
      }

      setLastError(response.error);
    } catch (error) {
      setLastError(
        createRendererError(
          'BRIDGE_REQUEST_FAILED',
          error instanceof Error ? error.message : 'The media command failed.',
          'Retry after playback starts on the phone, or use Troubleshoot for details.'
        )
      );
    } finally {
      setPendingMediaCommand(null);
    }
  }, [api, connectionSnapshot.state, pendingMediaCommand]);

  const handleOpenConnection = useCallback(async (): Promise<void> => {
    if (!canOpenConnection || api === null || selectedDeviceId === null) {
      return;
    }

    await runWithActivity('opening-connection', async () => {
      const response = await api.openConnection(selectedDeviceId);
      if (isBridgeResponseOk(response)) {
        setConnectionSnapshot(response.payload);
        setLastError(null);
        return;
      }

      setLastError(response.error);
    });
  }, [api, canOpenConnection, runWithActivity, selectedDeviceId]);

  const handleConnectFlow = useCallback(async (): Promise<void> => {
    if (api === null || selectedDeviceId === null || !bridgeReady || actionInFlight) {
      return;
    }

    if (connectionSnapshot.state === 'Ready') {
      await handleOpenConnection();
      return;
    }

    if (connectionSnapshot.state === 'Connected' || connectionSnapshot.state === 'Connecting') {
      return;
    }

    try {
      setPendingActivity('enabling-connection');

      const enableResponse = await api.enableConnection(selectedDeviceId);
      if (!isBridgeResponseOk(enableResponse)) {
        setLastError(enableResponse.error);
        return;
      }

      setConnectionSnapshot(enableResponse.payload);
      setLastError(null);

      setPendingActivity('opening-connection');

      const openResponse = await api.openConnection(selectedDeviceId);
      if (!isBridgeResponseOk(openResponse)) {
        setLastError(openResponse.error);
        return;
      }

      setConnectionSnapshot(openResponse.payload);
      setLastError(null);
    } catch (error) {
      setLastError(
        createRendererError(
          'INTERNAL_ERROR',
          error instanceof Error ? error.message : 'The requested action failed.',
          'Retry the action or inspect troubleshooting details.'
        )
      );
    } finally {
      setPendingActivity('none');
    }
  }, [api, selectedDeviceId, bridgeReady, actionInFlight, connectionSnapshot.state, handleOpenConnection]);

  const handleReleaseConnection = useCallback(async (): Promise<void> => {
    if (!canReleaseConnection || api === null) {
      return;
    }

    await runWithActivity('releasing-connection', async () => {
      const response = await api.releaseConnection(selectedDeviceId);
      if (isBridgeResponseOk(response)) {
        setConnectionSnapshot(response.payload);
        setLastError(null);
        return;
      }

      setLastError(response.error);
    });
  }, [api, canReleaseConnection, runWithActivity, selectedDeviceId]);

  const statusLine = (() => {
    if (api === null) {
      return 'App services are unavailable right now.';
    }

    if (isBootstrapping || currentActivity === 'refreshing-devices') {
      return 'Looking for nearby phones.';
    }

    if (!bridgeReady) {
      return 'Bluetooth connection service is not ready.';
    }

    if (selectedDevice === null) {
      return 'Select a phone to connect.';
    }

    if (currentActivity === 'enabling-connection' || currentActivity === 'opening-connection' || connectionSnapshot.state === 'Connecting') {
      return `Connecting to ${selectedDevice.name}.`;
    }

    if (connectionSnapshot.state === 'Connected') {
      return `Connected to ${selectedDevice.name}.`;
    }

    if (connectionSnapshot.state === 'Failed') {
      return `Couldn't connect to ${selectedDevice.name}.`;
    }

    return `Ready to connect to ${selectedDevice.name}.`;
  })();

  const shouldShowTroubleshootLink =
    api === null ||
    lastError !== null ||
    connectionSnapshot.state === 'Connected' ||
    connectionSnapshot.state === 'Failed' ||
    !bridgeReady ||
    readiness.mediaAudio.state !== 'supported';

  const selectedDeviceTone = selectedDevice === null ? 'neutral' : getDeviceTone(selectedDevice, true, connectionSnapshot.state);
  const connectPanelTone =
    currentActivity === 'enabling-connection' || currentActivity === 'opening-connection' || connectionSnapshot.state === 'Connecting'
      ? 'warning'
      : connectionSnapshot.state === 'Connected'
        ? 'good'
        : connectionSnapshot.state === 'Failed'
          ? 'bad'
          : 'neutral';
  const isConnectingVisual =
    currentActivity === 'enabling-connection' || currentActivity === 'opening-connection' || connectionSnapshot.state === 'Connecting';

  const problemTitle = (() => {
    if (lastError !== null) {
      return 'Something needs attention';
    }

    if (!bridgeReady) {
      return 'Connection service is not ready';
    }

    if (readiness.mediaAudio.state !== 'supported') {
      return 'Playback support is still limited';
    }

    return 'Help';
  })();

  const problemMessage = (() => {
    if (lastError !== null) {
      return lastError.message;
    }

    if (!bridgeReady) {
      return bridgeHealth.reason ?? 'Bluetooth audio service is currently unavailable.';
    }

    return readiness.mediaAudio.reason;
  })();

  const problemAction =
    lastError?.suggestedAction ??
    (!bridgeReady
      ? 'Try refreshing devices or reopening the app.'
      : connectionSnapshot.state === 'Failed'
        ? 'Try connecting again after checking Bluetooth on your phone.'
        : null);

  const recentDiagnostics = summaryDiagnostics.slice(0, 4);
  const shouldShowAdvancedDetails = advancedDiagnostics.length > 0 || connectionSnapshot.state === 'Connected';

  const primaryAction = (() => {
    if (connectionSnapshot.state === 'Connected') {
      return {
        label: BUTTON_LABELS.releaseConnection,
        disabled: !canReleaseConnection,
        onClick: () => void handleReleaseConnection(),
        variant: 'ghost' as const
      };
    }

    if (isConnectingVisual) {
      return {
        label: BUTTON_LABELS.openConnection,
        disabled: true,
        onClick: () => undefined,
        variant: 'primary' as const
      };
    }

    if (devices.length === 0 || (!bridgeReady && canRefreshDevices)) {
      return {
        label: BUTTON_LABELS.refreshDevices,
        disabled: !canRefreshDevices,
        onClick: () => void handleRefreshDevices(),
        variant: 'secondary' as const
      };
    }

      return {
        label: BUTTON_LABELS.openConnection,
        disabled: selectedDeviceId === null || !bridgeReady || actionInFlight,
        onClick: () => void handleConnectFlow(),
        variant: 'primary' as const
      };
    })();

  useEffect(() => {
    if (previousPrimaryLabelRef.current === null) {
      previousPrimaryLabelRef.current = primaryAction.label;
      return;
    }

    if (previousPrimaryLabelRef.current === primaryAction.label) {
      return;
    }

    previousPrimaryLabelRef.current = primaryAction.label;
    setButtonMorph(true);

    const timeoutId = window.setTimeout(() => {
      setButtonMorph(false);
    }, 320);

    return () => window.clearTimeout(timeoutId);
  }, [primaryAction.label]);

  const appStyle = {
    '--ui-scale': uiScale,
    '--display-scale-factor': displayScaleFactor
  } as CSSProperties;

  return (
    <div className="simple-app" data-density={densityProfile} data-ui-motion={uiMotionPaused ? 'paused' : 'active'} style={appStyle}>
      <div className="window-shell">
        <header className="custom-topbar">
          <div className="custom-topbar__brand">
            <span className="custom-topbar__icon">
              <AppIcon />
            </span>
            <div className="custom-topbar__copy">
              <strong>{APP_TITLE}</strong>
              <span className="custom-topbar__version">v{appVersion || '0.1.0'}</span>
            </div>
          </div>

          <div className="custom-topbar__controls">
            <button aria-label="Minimize window" className="titlebar-button" onClick={() => void api?.minimizeWindow()} type="button">
              <MinimizeIcon />
            </button>
            <button aria-label={isWindowMaximized ? 'Restore window' : 'Maximize window'} className="titlebar-button" onClick={() => void api?.toggleMaximizeWindow()} type="button">
              {isWindowMaximized ? <RestoreIcon /> : <MaximizeIcon />}
            </button>
            <button aria-label="Hide window to tray" className="titlebar-button titlebar-button--close" onClick={() => void api?.closeWindow()} type="button">
              <CloseIcon />
            </button>
          </div>
        </header>

        <main className="mini-shell">
          <header className="app-header">
          <div className="app-header__copy">
            <p className="eyebrow">Phone speaker</p>
            <h1>{APP_TITLE}</h1>
            <p className="subtitle">Choose a phone and connect it to this PC.</p>
          </div>
          <div className={`state-pill state-pill--${getConnectionTone(connectionSnapshot.state)}`}>
            <Signal tone={getConnectionTone(connectionSnapshot.state)} />
            <span>{connectionSnapshot.state}</span>
          </div>
          </header>

          <section className="devices-panel">
          <div className="devices-panel__header">
            <h2>
              <PhoneIcon />
              <span>{PANEL_LABELS.eligibleDevices}</span>
            </h2>
            <label className="search-field" htmlFor="device-query">
              <span className="sr-only">Search devices</span>
              <SearchIcon className="search-field__icon" />
              <input id="device-query" onChange={(event) => setDeviceQuery(event.target.value)} placeholder="Search devices" type="search" value={deviceQuery} />
            </label>
          </div>

          {isBootstrapping && devices.length === 0 ? (
            <div className="empty-state">Looking for nearby phones.</div>
          ) : filteredDevices.length === 0 ? (
            <div className="empty-state">
              {deviceQuery.trim().length > 0
                ? 'No phones match your search.'
                : 'No phones are ready right now. Refresh and try again.'}
            </div>
          ) : (
            <div className="device-list">
              {filteredDevices.map((device) => {
                const isSelected = device.id === selectedDeviceId;
                const deviceTone = getDeviceTone(device, isSelected, connectionSnapshot.state);

                return (
                  <button
                    className={`device-row${isSelected ? ' device-row--selected' : ''}${selectionPulseId === device.id ? ' device-row--pulse' : ''}`}
                    key={device.id}
                    onClick={() => setSelectedDeviceId(device.id)}
                    type="button"
                  >
                    <div className="device-row__line">
                      <div className="device-row__identity">
                        <Signal tone={deviceTone} />
                        <strong>{device.name}</strong>
                      </div>
                      <div className="device-row__meta-badges">
                        {device.batteryPercent != null ? <span className="device-badge device-badge--neutral">{device.batteryPercent}%</span> : null}
                        <span className={`device-badge device-badge--${deviceTone}`}>{getDeviceBadgeText(device, isSelected)}</span>
                      </div>
                    </div>
                    {isSelected ? <p className="device-row__detail">{getDeviceStatusLine(device, isSelected, connectionSnapshot.state)}</p> : null}
                  </button>
                );
              })}
            </div>
          )}
          </section>

          <section className={`connect-panel connect-panel--${connectPanelTone}${feedbackPulse === 'connected' ? ' connect-panel--celebrate' : ''}${feedbackPulse === 'failed' ? ' connect-panel--shake' : ''}`}>
          {selectedDevice === null ? (
            <div className="connect-panel__empty">
              <div className="selected-phone selected-phone--empty">
                <Signal tone="neutral" />
                <div>
                  <strong>No phone selected</strong>
                  <span>Choose a phone from the list above to see live audio visuals and connection controls.</span>
                </div>
              </div>

              <button className={`primary-button primary-button--${primaryAction.variant}${buttonMorph ? ' primary-button--morph' : ''}`} disabled={primaryAction.disabled} onClick={primaryAction.onClick} type="button">
                <span className={`primary-button__icon${isConnectingVisual ? ' primary-button__icon--busy' : ''}`}>
                  {primaryAction.label === BUTTON_LABELS.releaseConnection ? <ReleaseIcon /> : isConnectingVisual ? <ButtonActivityDots /> : <ConnectIcon />}
                </span>
                {primaryAction.label}
              </button>

              <div className="status-line">
                <span>{statusLine}</span>
                {shouldShowTroubleshootLink ? (
                  <button className="link-button" onClick={() => setShowTroubleshoot((currentValue) => !currentValue)} type="button">
                    {showTroubleshoot ? 'Hide help' : 'Troubleshoot'}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <div className="selected-phone">
                <Signal tone={selectedDeviceTone} />
                <div>
                  <strong>{selectedDevice.name}</strong>
                  <span>{getDeviceStatusLine(selectedDevice, true, connectionSnapshot.state)}</span>
                </div>
              </div>

              {showRemoteMediaCard ? (
                <section className="media-session-card" aria-label="Phone media">
                  <div className="media-session-card__header">
                    <div className="media-session-card__copy">
                      <span className="media-session-card__eyebrow">
                        <MusicIcon />
                        Phone media
                      </span>
                      <strong>{getRemoteMediaTitle(mediaRemoteSession)}</strong>
                      <span>{getRemoteMediaSubtitle(mediaRemoteSession)}</span>
                    </div>
                    <span className={`device-badge device-badge--${getRemoteMediaTone(mediaRemoteSession)}`}>{getRemotePlaybackLabel(mediaRemoteSession.playbackState)}</span>
                  </div>

                  {hasRemoteMediaControls(mediaRemoteSession) ? (
                    <div className="media-session-card__controls" role="group" aria-label="Phone media transport controls">
                      {mediaRemoteSession.controls.canPrevious ? (
                        <MediaTransportButton disabled={pendingMediaCommand !== null} label="Previous track" onClick={() => void handleMediaRemoteCommand('previous')}>
                          <PreviousTrackIcon />
                        </MediaTransportButton>
                      ) : null}
                      {primaryMediaCommand !== null ? (
                        <MediaTransportButton
                          disabled={pendingMediaCommand !== null}
                          emphasized
                          label={getRemotePrimaryCommandLabel(primaryMediaCommand, mediaRemoteSession.playbackState)}
                          onClick={() => void handleMediaRemoteCommand(primaryMediaCommand)}
                        >
                          {primaryMediaCommand === 'pause' || (primaryMediaCommand === 'toggle-play-pause' && mediaRemoteSession.playbackState === 'playing') ? <PauseIcon /> : <PlayIcon />}
                        </MediaTransportButton>
                      ) : null}
                      {mediaRemoteSession.controls.canNext ? (
                        <MediaTransportButton disabled={pendingMediaCommand !== null} label="Next track" onClick={() => void handleMediaRemoteCommand('next')}>
                          <NextTrackIcon />
                        </MediaTransportButton>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <div className="connect-panel__media">
                <AudioRibbonVisualizer api={api} connectionState={connectionSnapshot.state} paused={uiMotionPaused} pixelRatio={displayScaleFactor} profile={visualizerProfile} />

                <div className="visualizer-presets" role="group" aria-label="Visualizer feel">
                  <span className="visualizer-presets__label">Visualizer feel</span>
                  <div className="visualizer-presets__list">
                    {VISUALIZER_PROFILES.map((profile) => (
                      <button
                        key={profile.id}
                        aria-pressed={visualizerProfile === profile.id}
                        className={`visualizer-preset${visualizerProfile === profile.id ? ' visualizer-preset--active' : ''}`}
                        onClick={() => setVisualizerProfile(profile.id)}
                        type="button"
                      >
                        <strong>{profile.label}</strong>
                        <span>{profile.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="connect-panel__controls">
                <div className="connect-panel__actions">
                  <ConnectionIndicator activity={currentActivity} pulseState={feedbackPulse} state={connectionSnapshot.state} />

                  <button className={`primary-button primary-button--${primaryAction.variant}${buttonMorph ? ' primary-button--morph' : ''}`} disabled={primaryAction.disabled} onClick={primaryAction.onClick} type="button">
                    <span className={`primary-button__icon${isConnectingVisual ? ' primary-button__icon--busy' : ''}`}>
                      {primaryAction.label === BUTTON_LABELS.releaseConnection ? <ReleaseIcon /> : isConnectingVisual ? <ButtonActivityDots /> : <ConnectIcon />}
                    </span>
                    {primaryAction.label}
                  </button>
                </div>

                <div className="progress-track" aria-hidden="true">
                  <span
                    className={`progress-fill progress-fill--${getConnectionTone(connectionSnapshot.state)}${feedbackPulse === 'connected' ? ' progress-fill--success-sweep' : ''}`}
                    style={{ width: `${getConnectionProgress(connectionSnapshot.state)}%` }}
                  />
                </div>

                <div className="status-line">
                  <span>{statusLine}</span>
                  {shouldShowTroubleshootLink ? (
                    <button className="link-button" onClick={() => setShowTroubleshoot((currentValue) => !currentValue)} type="button">
                      {showTroubleshoot ? 'Hide help' : 'Troubleshoot'}
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          )}
          </section>

          {showTroubleshoot ? (
            <section className="troubleshoot-panel">
            <div className="troubleshoot-panel__header">
              <h2>
                <HelpIcon />
                <span>Troubleshoot</span>
              </h2>
              <span>{recentDiagnostics.length} recent updates</span>
            </div>

            <div className="support-grid">
              {selectedDevice !== null ? (
                <section className="support-card">
                  <div className="support-pill support-pill--neutral">
                    <PhoneIcon />
                    <strong>Device info</strong>
                  </div>
                  <p>
                    {[selectedDevice.manufacturer, selectedDevice.modelName].filter(Boolean).join(' • ') || 'Basic Bluetooth device information only.'}
                  </p>
                  {selectedDevice.batteryPercent != null ? <p>Battery level reported by Windows: {selectedDevice.batteryPercent}%.</p> : null}
                </section>
              ) : null}

              <section className="support-card">
                <div className={`support-pill support-pill--${readiness.mediaAudio.state === 'supported' ? 'good' : readiness.mediaAudio.state === 'unsupported' ? 'bad' : 'warning'}`}>
                  <SparkIcon />
                  <Signal tone={readiness.mediaAudio.state === 'supported' ? 'good' : readiness.mediaAudio.state === 'unsupported' ? 'bad' : 'warning'} />
                  <strong>Music and video</strong>
                </div>
                <p>{readiness.mediaAudio.reason}</p>
              </section>

              <section className="support-card">
                <div className={`support-pill support-pill--${mediaRemoteSession.state === 'available' ? 'good' : 'warning'}`}>
                  <MusicIcon />
                  <Signal tone={mediaRemoteSession.state === 'available' ? 'good' : 'warning'} />
                  <strong>Remote controls</strong>
                </div>
                <p>{mediaRemoteSession.detail}</p>
                {mediaRemoteSession.state === 'available' && hasRemoteMediaMetadata(mediaRemoteSession) ? <p>Latest track: {getRemoteMediaTitle(mediaRemoteSession)}</p> : null}
              </section>

              <section className="support-card">
                <div className="support-pill support-pill--warning">
                  <WarningIcon />
                  <Signal tone="warning" />
                  <strong>Bluetooth volume</strong>
                </div>
                <p>{mediaRemoteSession.absoluteVolumeDetail}</p>
              </section>

              <section className="support-card">
                <div className={`support-pill support-pill--${readiness.callAudio.state === 'supported' ? 'good' : readiness.callAudio.state === 'unsupported' ? 'bad' : 'warning'}`}>
                  <PhoneIcon />
                  <Signal tone={readiness.callAudio.state === 'supported' ? 'good' : readiness.callAudio.state === 'unsupported' ? 'bad' : 'warning'} />
                  <strong>Phone calls</strong>
                </div>
                <p>{readiness.callAudio.reason}</p>
              </section>
            </div>

            {isLoadingDiagnostics ? <div className="empty-state">Loading connection details.</div> : null}

            <section className="problem-card">
              <div className="problem-pill">
                <Signal tone={lastError !== null || connectionSnapshot.state === 'Failed' ? 'bad' : !bridgeReady ? 'warning' : 'neutral'} />
                <strong>{problemTitle}</strong>
              </div>
              <p>{problemMessage}</p>
              {problemAction ? <p className="problem-card__hint">{problemAction}</p> : null}
            </section>

            {recentDiagnostics.length > 0 ? (
              <ol className="event-list">
                {recentDiagnostics.map((entry) => (
                  <li
                    className={`event-row event-row--${entry.severity}${isManualVolumeTestDiagnostic(entry) ? ' event-row--callout' : ''}`}
                    key={entry.id}
                  >
                    <Signal
                      tone={
                        isManualVolumeTestDiagnostic(entry)
                          ? 'warning'
                          : entry.severity === 'error'
                            ? 'bad'
                            : entry.severity === 'warning'
                              ? 'warning'
                              : 'neutral'
                      }
                    />
                    <div>
                      <strong>{entry.title}</strong>
                      {entry.detail ? <p>{entry.detail}</p> : null}
                      {isManualVolumeTestDiagnostic(entry) ? (
                        <p className="diagnostic-outcomes">
                          Observe: <span>Windows volume changed</span> <span>loudness changed but Windows volume did not</span>{' '}
                          <span>no observable linkage</span>
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}

            {shouldShowAdvancedDetails ? (
              <details className="details-block">
                <summary>Advanced details</summary>
                <div className="advanced-list">
                  <VisualizerDiagnosticsProbe api={api} connected={connectionSnapshot.state === 'Connected'} />
                  {advancedDiagnostics.slice(0, 6).map((entry) => (
                    <div className="advanced-row" key={entry.id}>
                      <strong>{entry.label}</strong>
                      {entry.detail !== null ? <pre>{entry.detail}</pre> : <p>No additional detail.</p>}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
