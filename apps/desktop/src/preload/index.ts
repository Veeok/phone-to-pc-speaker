import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  DESKTOP_SHELL_EVENT_CHANNEL,
  DESKTOP_SHELL_REQUEST_CHANNEL,
  RENDERER_EVENT_CHANNEL,
  RENDERER_REQUEST_CHANNEL,
  type DesktopShellInfo,
  type DesktopWindowStateChangedPayload,
  type BridgeEvent,
  type BridgeEventMap,
  type BridgeRequest,
  type BridgeRequestMap,
  type BridgeResponse,
  type PhoneToPcSpeakerApi,
  type Unsubscribe
} from '@phone-to-pc-speaker/shared-types';

function invokeBridgeRequest<K extends keyof BridgeRequestMap>(
  type: K,
  payload: BridgeRequestMap[K]
): Promise<BridgeResponse<K>> {
  const request: BridgeRequest<K> = {
    id: globalThis.crypto.randomUUID(),
    type,
    payload
  };

  return ipcRenderer.invoke(RENDERER_REQUEST_CHANNEL, request) as Promise<BridgeResponse<K>>;
}

function subscribeToEvent<K extends keyof BridgeEventMap>(
  type: K,
  listener: (payload: BridgeEventMap[K]) => void
): Unsubscribe {
  const handler = (_event: IpcRendererEvent, message: BridgeEvent) => {
    if (message.type === type) {
      listener(message.payload as BridgeEventMap[K]);
    }
  };

  ipcRenderer.on(RENDERER_EVENT_CHANNEL, handler);

  return () => {
    ipcRenderer.removeListener(RENDERER_EVENT_CHANNEL, handler);
  };
}

function subscribeToDesktopShellEvent(listener: (payload: DesktopWindowStateChangedPayload) => void): Unsubscribe {
  const handler = (_event: IpcRendererEvent, payload: DesktopWindowStateChangedPayload) => {
    listener(payload);
  };

  ipcRenderer.on(DESKTOP_SHELL_EVENT_CHANNEL, handler);

  return () => {
    ipcRenderer.removeListener(DESKTOP_SHELL_EVENT_CHANNEL, handler);
  };
}

const phoneToPcSpeakerApi: PhoneToPcSpeakerApi = {
  ping: () => invokeBridgeRequest('bridge.ping', {}),
  refreshDevices: () => invokeBridgeRequest('devices.refresh', {}),
  enableConnection: (deviceId: string) => invokeBridgeRequest('connection.enable', { deviceId }),
  openConnection: (deviceId: string) => invokeBridgeRequest('connection.open', { deviceId }),
  releaseConnection: (deviceId: string | null) => invokeBridgeRequest('connection.release', { deviceId }),
  getRecentDiagnostics: (limit?: number) =>
    invokeBridgeRequest('diagnostics.getRecent', { limit: limit ?? null }),
  getCapabilities: () => invokeBridgeRequest('capabilities.getCurrent', {}),
  getMediaRemoteSession: () => invokeBridgeRequest('media.session.getCurrent', {}),
  sendMediaRemoteCommand: (command) => invokeBridgeRequest('media.session.sendCommand', { command }),
  getDesktopShellInfo: () => ipcRenderer.invoke(DESKTOP_SHELL_REQUEST_CHANNEL, { type: 'get-info' }) as Promise<DesktopShellInfo>,
  minimizeWindow: () => ipcRenderer.invoke(DESKTOP_SHELL_REQUEST_CHANNEL, { type: 'minimize' }) as Promise<void>,
  toggleMaximizeWindow: () => ipcRenderer.invoke(DESKTOP_SHELL_REQUEST_CHANNEL, { type: 'toggle-maximize' }) as Promise<void>,
  closeWindow: () => ipcRenderer.invoke(DESKTOP_SHELL_REQUEST_CHANNEL, { type: 'close' }) as Promise<void>,
  onDevicesUpdated: (listener) => subscribeToEvent('devices.updated', listener),
  onConnectionStateChanged: (listener) => subscribeToEvent('connection.stateChanged', listener),
  onDiagnosticsAppended: (listener) => subscribeToEvent('diagnostics.appended', listener),
  onBridgeHealthChanged: (listener) => subscribeToEvent('bridge.healthChanged', listener),
  onCapabilitiesUpdated: (listener) => subscribeToEvent('capabilities.updated', listener),
  onAudioVisualizerSignalUpdated: (listener) => subscribeToEvent('visualizer.signalUpdated', listener),
  onMediaRemoteSessionUpdated: (listener) => subscribeToEvent('media.sessionUpdated', listener),
  onDesktopWindowStateChanged: (listener) => subscribeToDesktopShellEvent(listener)
};

contextBridge.exposeInMainWorld('phoneToPcSpeaker', phoneToPcSpeakerApi);
