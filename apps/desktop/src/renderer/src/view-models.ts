import {
  type BridgeHealth,
  type CommunicationReadiness,
  type ConnectionSnapshot,
  type ConnectionState,
  type DeviceSummary,
  type SelectedDeviceSummary,
  type UserFacingError
} from '@phone-to-pc-speaker/shared-types';

export interface SetupChecklistItem {
  id: 'bridge' | 'media' | 'device' | 'connection';
  label: string;
  description: string;
  state: 'complete' | 'current' | 'blocked';
}

export interface BannerModel {
  tone: 'neutral' | 'positive' | 'warning' | 'negative';
  title: string;
  description: string;
}

export function formatTimestamp(timestamp: string | null): string {
  if (timestamp === null) {
    return 'Not available';
  }

  const parsedDate = new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    return timestamp;
  }

  return parsedDate.toLocaleString();
}

export function formatRelativeTimestamp(timestamp: string | null): string {
  if (timestamp === null) {
    return 'Unknown';
  }

  const parsedDate = new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    return timestamp;
  }

  const diffMs = parsedDate.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 1) {
    return 'just now';
  }

  if (Math.abs(diffMinutes) < 60) {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(diffHours, 'hour');
  }

  const diffDays = Math.round(diffHours / 24);
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(diffDays, 'day');
}

export function matchesDeviceSearch(device: DeviceSummary, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return true;
  }

  return `${device.name} ${device.id}`.toLowerCase().includes(normalizedQuery);
}

export function sortDevices(devices: DeviceSummary[], selectedDeviceId: string | null): DeviceSummary[] {
  return [...devices].sort((left, right) => {
    if (left.id === selectedDeviceId) {
      return -1;
    }

    if (right.id === selectedDeviceId) {
      return 1;
    }

    if (left.canConnect !== right.canConnect) {
      return left.canConnect ? -1 : 1;
    }

    return new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime();
  });
}

export function getDeviceStatusLine(
  device: DeviceSummary,
  isSelected: boolean,
  connectionState: ConnectionState
): string {
  if (isSelected && connectionState === 'Connected') {
    return 'Selected for active media playback.';
  }

  if (isSelected && connectionState === 'Ready') {
    return 'Selected and ready to open.';
  }

  if (isSelected && connectionState === 'Failed') {
    return 'Selected, but the last connection attempt failed.';
  }

  if (device.canConnect && device.isPaired) {
    return 'Eligible for media routing on this PC.';
  }

  if (device.canConnect) {
    return 'Visible to Windows and eligible, but pairing metadata is incomplete.';
  }

  return 'Not currently connectable through the Windows media route.';
}

export function buildSelectedDeviceSummary(
  selectedDevice: DeviceSummary | null,
  selectedDeviceId: string | null,
  connectionSnapshot: ConnectionSnapshot
): SelectedDeviceSummary {
  if (selectedDevice === null) {
    return {
      id: selectedDeviceId,
      displayName: null,
      availabilitySummary:
        selectedDeviceId === null ? 'No device is currently selected.' : 'The remembered device is not currently eligible.',
      pairingSummary:
        selectedDeviceId === null ? 'Choose a device from Eligible Devices.' : 'Windows cannot currently confirm pairing details.',
      eligibilitySummary:
        selectedDeviceId === null
          ? 'Select an eligible device to prepare the media-audio flow.'
          : 'Refresh devices or bring the phone back into range to restore eligibility.',
      lastSeenAt: null,
      rawDeviceId: selectedDeviceId,
      explanation:
        selectedDeviceId === null
          ? null
          : 'The saved device identifier is still stored locally, but Windows is not currently listing it as an eligible media-audio device.'
    };
  }

  const pairingSummary = selectedDevice.isPaired
    ? 'Windows reports the selected device as paired.'
    : 'Windows pairing metadata is incomplete or currently reports the device as not paired.';
  const availabilitySummary = selectedDevice.canConnect
    ? 'The selected device is eligible for the media-audio foundation path.'
    : 'The selected device is listed but not currently connectable.';
  const bridgeFailure =
    connectionSnapshot.state === 'Failed' && connectionSnapshot.detail?.toLowerCase().includes('bridge') === true;
  const eligibilitySummary = bridgeFailure
    ? 'The selected device is remembered, but the bridge is currently unavailable.'
    : getDeviceStatusLine(selectedDevice, true, connectionSnapshot.state);

  let explanation: string | null = null;
  if (bridgeFailure) {
    explanation =
      'The phone remains selected, but the native bridge exited unexpectedly. Restore bridge health before trusting any live connection state.';
  } else if (!selectedDevice.isPaired && connectionSnapshot.state !== 'Disconnected') {
    explanation =
      'The bridge established a valid media-audio path even though Windows pairing metadata is incomplete. Treat the pairing label as advisory, not as the final truth of the connection path.';
  } else if (!selectedDevice.canConnect) {
    explanation =
      'The selected device is present, but Windows is not currently exposing it as connectable through the media-audio route.';
  }

  return {
    id: selectedDevice.id,
    displayName: selectedDevice.name,
    availabilitySummary,
    pairingSummary,
    eligibilitySummary,
    lastSeenAt: selectedDevice.lastSeenAt,
    rawDeviceId: selectedDevice.id,
    explanation
  };
}

export function getRecommendedAction(connectionSnapshot: ConnectionSnapshot): string {
  switch (connectionSnapshot.state) {
    case 'Disconnected':
      return 'Select a device, then enable the media-audio connection.';
    case 'Ready':
      return 'Open Connection to route media audio to this PC.';
    case 'Connecting':
      return 'Wait for the open request to finish before taking another action.';
    case 'Connected':
      return 'Release Connection when you want to stop routing media audio.';
    case 'Failed':
      return 'Review Last Error and Diagnostics, then retry or release the connection.';
    default:
      return 'Review the current device and connection state before continuing.';
  }
}

export function getConnectionProgress(connectionSnapshot: ConnectionSnapshot): number {
  switch (connectionSnapshot.state) {
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

export function buildSetupChecklist(
  bridgeHealth: BridgeHealth,
  readiness: CommunicationReadiness,
  selectedDeviceId: string | null,
  connectionSnapshot: ConnectionSnapshot
): SetupChecklistItem[] {
  return [
    {
      id: 'bridge',
      label: 'Bridge availability',
      description:
        bridgeHealth.status === 'healthy'
          ? 'Native bridge is healthy and responding.'
          : bridgeHealth.reason ?? 'Bridge availability still needs attention.',
      state: bridgeHealth.status === 'healthy' ? 'complete' : 'blocked'
    },
    {
      id: 'media',
      label: 'Media path readiness',
      description: readiness.mediaAudio.reason,
      state:
        readiness.mediaAudio.state === 'supported'
          ? 'complete'
          : readiness.mediaAudio.state === 'unsupported'
            ? 'blocked'
            : 'current'
    },
    {
      id: 'device',
      label: 'Device selection',
      description:
        selectedDeviceId === null
          ? 'Choose an eligible phone to continue the connection workflow.'
          : 'A device is selected and ready for the next step.',
      state: selectedDeviceId === null ? 'current' : 'complete'
    },
    {
      id: 'connection',
      label: 'Connection staging',
      description: getRecommendedAction(connectionSnapshot),
      state:
        connectionSnapshot.state === 'Connected' ||
        connectionSnapshot.state === 'Connecting' ||
        connectionSnapshot.state === 'Ready'
          ? 'complete'
          : connectionSnapshot.state === 'Failed'
            ? 'blocked'
            : 'current'
    }
  ];
}

export function getSetupCompletion(steps: SetupChecklistItem[]): number {
  const completedCount = steps.filter((step) => step.state === 'complete').length;
  return Math.round((completedCount / steps.length) * 100);
}

export function buildBannerModel(
  bridgeHealth: BridgeHealth,
  readiness: CommunicationReadiness,
  connectionSnapshot: ConnectionSnapshot,
  lastError: UserFacingError | null
): BannerModel | null {
  if (bridgeHealth.status !== 'healthy') {
    return {
      tone: 'negative',
      title: 'Bridge attention required',
      description: bridgeHealth.reason ?? 'The bridge is not currently healthy. Restore bridge health before trusting connection actions.'
    };
  }

  if (connectionSnapshot.state === 'Failed') {
    return {
      tone: 'warning',
      title: 'Connection flow needs review',
      description: lastError?.suggestedAction ?? getRecommendedAction(connectionSnapshot)
    };
  }

  if (readiness.mediaAudio.state !== 'supported') {
    return {
      tone: 'warning',
      title: 'Media readiness is not fully verified yet',
      description: readiness.mediaAudio.reason
    };
  }

  return null;
}
