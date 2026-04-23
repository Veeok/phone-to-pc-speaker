import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  createDefaultConnectionSnapshot,
  createEmptyDiagnosticsSnapshot,
  createUnknownCommunicationReadiness,
  type AdvancedDiagnosticEntry,
  type BridgeEvent,
  type BridgeHealth,
  type BridgeRequest,
  type BridgeRequestMap,
  type BridgeResponse,
  type CommunicationReadiness,
  type ConnectionStateChangedPayload,
  type DiagnosticsCategory,
  type DiagnosticsEvent,
  type DiagnosticsSeverity,
  type DiagnosticsSnapshot,
  type DiagnosticsSource,
  type UserFacingError,
  type UserFacingErrorCode
} from '@phone-to-pc-speaker/shared-types';

type ForwardedRequestType = Exclude<
  keyof BridgeRequestMap,
  'bridge.ping' | 'diagnostics.getRecent' | 'capabilities.getCurrent'
>;

interface PendingRequest {
  resolve: (response: BridgeResponse) => void;
  timeout: NodeJS.Timeout;
}

interface BridgeLaunchCommand {
  command: string;
  args: string[];
  bridgePath: string;
}

interface BridgeLaunchCandidate extends BridgeLaunchCommand {
  modifiedAt: number;
  prefersOnTie: number;
}

interface DiagnosticOptions {
  category?: DiagnosticsCategory;
  summaryDetail?: string | null;
  advancedLabel?: string;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBridgeResponseMessage(value: unknown): value is BridgeResponse {
  return isObjectRecord(value) && typeof value.requestId === 'string' && typeof value.ok === 'boolean';
}

function isBridgeEventMessage(value: unknown): value is BridgeEvent {
  return isObjectRecord(value) && typeof value.type === 'string' && 'payload' in value;
}

function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

function truncateDetail(detail: string, maxLength = 140): string {
  const normalizedDetail = detail.replace(/\s+/gu, ' ').trim();
  if (normalizedDetail.length <= maxLength) {
    return normalizedDetail;
  }

  return `${normalizedDetail.slice(0, maxLength - 1)}...`;
}

function summarizeDetail(detail: string | null, category: DiagnosticsCategory): string | null {
  if (detail === null || detail.trim().length === 0) {
    return null;
  }

  if (category === 'device-identifier') {
    return 'Identifier moved to advanced diagnostics.';
  }

  return truncateDetail(detail);
}

function mapBridgeHealthStatusToCapabilityHealth(status: BridgeHealth['status']): CommunicationReadiness['bridgeHealth'] {
  switch (status) {
    case 'healthy':
      return 'healthy';
    case 'unavailable':
      return 'failed';
    default:
      return 'degraded';
  }
}

function findWorkspaceRoot(startDirectory: string): string {
  let currentDirectory = startDirectory;

  while (true) {
    if (existsSync(resolve(currentDirectory, 'pnpm-workspace.yaml'))) {
      return currentDirectory;
    }

    const parentDirectory = resolve(currentDirectory, '..');
    if (parentDirectory === currentDirectory) {
      return startDirectory;
    }

    currentDirectory = parentDirectory;
  }
}

function resolveDotnetCommand(): string {
  const userProfileDirectory = process.env.USERPROFILE;
  if (userProfileDirectory !== undefined) {
    const localDotnetPath = resolve(userProfileDirectory, '.dotnet', 'dotnet.exe');
    if (existsSync(localDotnetPath)) {
      return localDotnetPath;
    }
  }

  return 'dotnet';
}

function resolveBridgeLaunchCommand(): BridgeLaunchCommand | null {
  const sourceDirectory = dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = findWorkspaceRoot(sourceDirectory);
  const binRoot = resolve(workspaceRoot, 'packages', 'windows-bridge', 'PhoneToPcSpeaker.WindowsBridge', 'bin');
  const configurationDirectories = collectBridgeOutputDirectories(binRoot);

  const candidates: BridgeLaunchCandidate[] = [];

  for (const outputDirectory of configurationDirectories) {
    const executablePath = resolve(outputDirectory, 'PhoneToPcSpeaker.WindowsBridge.exe');
    const dllPath = resolve(outputDirectory, 'PhoneToPcSpeaker.WindowsBridge.dll');
    const hasExecutable = existsSync(executablePath);
    const hasDll = existsSync(dllPath);

    if (hasDll) {
      candidates.push({
        command: resolveDotnetCommand(),
        args: [dllPath],
        bridgePath: dllPath,
        modifiedAt: statSync(dllPath).mtimeMs,
        prefersOnTie: 1
      });
    }

    if (hasExecutable) {
      candidates.push({
        command: executablePath,
        args: [],
        bridgePath: executablePath,
        modifiedAt: statSync(executablePath).mtimeMs,
        prefersOnTie: 0
      });
    }
  }

  candidates.sort((left, right) => {
    if (right.modifiedAt !== left.modifiedAt) {
      return right.modifiedAt - left.modifiedAt;
    }

    return right.prefersOnTie - left.prefersOnTie;
  });

  const selectedCandidate = candidates[0];
  if (selectedCandidate === undefined) {
    return null;
  }

  return {
    command: selectedCandidate.command,
    args: selectedCandidate.args,
    bridgePath: selectedCandidate.bridgePath
  };
}

function collectBridgeOutputDirectories(binRoot: string): string[] {
  const fallbackDirectories = [
    resolve(binRoot, 'Debug', 'net8.0-windows10.0.19041.0'),
    resolve(binRoot, 'Release', 'net8.0-windows10.0.19041.0'),
    resolve(binRoot, 'VisualizerVerify')
  ];

  if (!existsSync(binRoot)) {
    return fallbackDirectories;
  }

  const discoveredDirectories = new Set<string>();

  for (const entry of readdirSync(binRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const directDirectory = resolve(binRoot, entry.name);
    discoveredDirectories.add(directDirectory);

    for (const nestedEntry of readdirSync(directDirectory, { withFileTypes: true })) {
      if (!nestedEntry.isDirectory()) {
        continue;
      }

      discoveredDirectories.add(resolve(directDirectory, nestedEntry.name));
    }
  }

  for (const fallbackDirectory of fallbackDirectories) {
    discoveredDirectories.add(fallbackDirectory);
  }

  return [...discoveredDirectories];
}

export class BridgeController {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutReader: Interface | null = null;
  private readonly diagnostics: DiagnosticsSnapshot = createEmptyDiagnosticsSnapshot();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private isStopping = false;
  private health: BridgeHealth = {
    status: 'starting',
    reason: null,
    checkedAt: getCurrentTimestamp(),
    bridgePath: null
  };
  private connectionSnapshot: ConnectionStateChangedPayload = createDefaultConnectionSnapshot();
  private readiness: CommunicationReadiness = createUnknownCommunicationReadiness('Waiting for bridge capability data.');

  public constructor(private readonly broadcast: (event: BridgeEvent) => void) {}

  public async start(): Promise<void> {
    if (this.child !== null) {
      return;
    }

    const launchCommand = resolveBridgeLaunchCommand();
    if (launchCommand === null) {
      this.setHealth('unavailable', 'bridge binary not found — run dotnet build', null);
      this.appendDiagnostic(
        'warning',
        'electron-main',
        'Windows bridge binary is unavailable at startup.',
        'Run dotnet build for the bridge project before launching the desktop shell.',
        {
          category: 'bridge-log',
          summaryDetail: 'Build the Windows bridge before launching the app.'
        }
      );
      return;
    }

    this.setHealth('starting', 'Starting Windows bridge process.', launchCommand.bridgePath);
    this.appendDiagnostic(
      'info',
      'electron-main',
      'Starting Windows bridge process.',
      launchCommand.bridgePath,
      {
        category: 'bridge-log',
        summaryDetail: 'Launching the native Windows bridge.'
      }
    );

    this.child = spawn(launchCommand.command, launchCommand.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    this.stdoutReader = createInterface({ input: this.child.stdout });
    this.stdoutReader.on('line', (line) => {
      this.handleStdoutLine(line);
    });

    this.child.stderr.on('data', (chunk: Buffer) => {
      const lines = chunk.toString('utf8').split(/\r?\n/u).filter((line) => line.trim().length > 0);
      for (const line of lines) {
        this.appendDiagnostic('info', 'windows-bridge', 'Bridge stderr log.', line.trim(), {
          category: 'bridge-log',
          summaryDetail: truncateDetail(line.trim()),
          advancedLabel: 'Bridge stderr'
        });
      }
    });

    this.child.on('error', (error: Error) => {
      this.setHealth('unavailable', error.message, launchCommand.bridgePath);
      this.appendDiagnostic('error', 'electron-main', 'Windows bridge failed to start.', error.message, {
        category: 'bridge-log',
        summaryDetail: 'The native Windows bridge could not be launched.'
      });
      this.failPendingRequests(
        this.createError(
          'BRIDGE_UNAVAILABLE',
          `Windows bridge failed to start: ${error.message}`,
          true,
          'Rebuild the bridge and relaunch the desktop app.'
        )
      );
    });

    this.child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      this.child = null;
      this.stdoutReader = null;

      if (this.isStopping) {
        return;
      }

      const closeReason = code !== null
        ? `Windows bridge exited with code ${code}.`
        : `Windows bridge exited because of signal ${signal ?? 'unknown'}.`;

      this.setHealth('unavailable', closeReason, launchCommand.bridgePath);
      this.emitConnectionState('Failed', 'none', this.connectionSnapshot.deviceId, closeReason);
      this.appendDiagnostic('error', 'electron-main', 'Windows bridge exited unexpectedly.', closeReason, {
        category: 'bridge-log',
        summaryDetail: 'The native Windows bridge disconnected unexpectedly.'
      });
      this.failPendingRequests(
        this.createError('BRIDGE_UNAVAILABLE', closeReason, true, 'Relaunch the desktop app after rebuilding the bridge.')
      );
    });
  }

  public async stop(): Promise<void> {
    this.isStopping = true;
    this.stdoutReader?.close();
    this.stdoutReader = null;
    this.failPendingRequests(
      this.createError('BRIDGE_UNAVAILABLE', 'Windows bridge is shutting down.', true, 'Relaunch the desktop app.')
    );

    if (this.child !== null) {
      this.child.stdin.end();
      this.child.kill();
      this.child = null;
    }
  }

  public async handleRequest<K extends keyof BridgeRequestMap>(request: BridgeRequest<K>): Promise<BridgeResponse<K>> {
    if (request.type === 'bridge.ping') {
      return {
        requestId: request.id,
        ok: true,
        payload: {
          health: this.health
        }
      } as BridgeResponse<K>;
    }

    if (request.type === 'diagnostics.getRecent') {
      const diagnosticsRequest = request as BridgeRequest<'diagnostics.getRecent'>;
      const limit = diagnosticsRequest.payload.limit ?? this.diagnostics.summary.length;
      const summary = this.diagnostics.summary.slice(-Math.max(limit, 0));
      const allowedSummaryIds = new Set(summary.map((entry) => entry.id));
      const advanced = this.diagnostics.advanced.filter(
        (entry): entry is AdvancedDiagnosticEntry => entry !== undefined && allowedSummaryIds.has(entry.summaryId)
      );

      return {
        requestId: request.id,
        ok: true,
        payload: {
          diagnostics: {
            summary,
            advanced
          }
        }
      } as BridgeResponse<K>;
    }

    if (request.type === 'capabilities.getCurrent') {
      return {
        requestId: request.id,
        ok: true,
        payload: {
          readiness: this.readiness
        }
      } as BridgeResponse<K>;
    }

    return this.forwardRequest(request as BridgeRequest<ForwardedRequestType>) as Promise<BridgeResponse<K>>;
  }

  private async forwardRequest<K extends ForwardedRequestType>(request: BridgeRequest<K>): Promise<BridgeResponse<K>> {
    if (this.child === null || !this.child.stdin.writable) {
      const error = this.createError(
        'BRIDGE_UNAVAILABLE',
        this.health.reason ?? 'Windows bridge is unavailable.',
        true,
        'Build the bridge with dotnet build and relaunch the app.'
      );

      this.appendDiagnostic('error', 'electron-main', `Bridge request ${request.type} could not be forwarded.`, error.message, {
        category: 'bridge-log',
        summaryDetail: 'The desktop app could not reach the native Windows bridge.'
      });

      return {
        requestId: request.id,
        ok: false,
        error
      };
    }

    return await new Promise<BridgeResponse<K>>((resolveRequest) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        const timeoutError = this.createError(
          'BRIDGE_REQUEST_FAILED',
          `Bridge request timed out: ${request.type}`,
          true,
          'Retry the action after checking bridge diagnostics.'
        );

        this.appendDiagnostic('error', 'electron-main', 'Bridge request timed out.', request.type, {
          category: 'technical-context',
          summaryDetail: 'The native bridge did not answer in time.'
        });
        resolveRequest({ requestId: request.id, ok: false, error: timeoutError });
      }, 15000);

      this.pendingRequests.set(request.id, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolveRequest(response as BridgeResponse<K>);
        },
        timeout
      });

      const serializedRequest = `${JSON.stringify(request)}\n`;
      this.child?.stdin.write(serializedRequest, 'utf8', (error: Error | null | undefined) => {
        if (error === null || error === undefined) {
          return;
        }

        const pendingRequest = this.pendingRequests.get(request.id);
        if (pendingRequest === undefined) {
          return;
        }

        this.pendingRequests.delete(request.id);
        clearTimeout(pendingRequest.timeout);
        const writeError = this.createError(
          'BRIDGE_REQUEST_FAILED',
          `Bridge request failed to write: ${error.message}`,
          true,
          'Retry after bridge health returns to healthy.'
        );

        this.appendDiagnostic('error', 'electron-main', 'Bridge stdin write failed.', error.message, {
          category: 'bridge-log',
          summaryDetail: 'The desktop app could not write a request to the native bridge.'
        });
        pendingRequest.resolve({ requestId: request.id, ok: false, error: writeError });
      });
    });
  }

  private handleStdoutLine(line: string): void {
    if (line.trim().length === 0) {
      return;
    }

    let parsedMessage: unknown;
    try {
      parsedMessage = JSON.parse(line) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown JSON parse failure.';
      this.appendDiagnostic('error', 'electron-main', 'Bridge emitted invalid JSON.', message, {
        category: 'technical-context',
        summaryDetail: 'The native bridge emitted malformed JSON.'
      });
      return;
    }

    if (isBridgeResponseMessage(parsedMessage)) {
      const pendingRequest = this.pendingRequests.get(parsedMessage.requestId);
      if (pendingRequest === undefined) {
        this.appendDiagnostic('warning', 'electron-main', 'Received an unmatched bridge response.', parsedMessage.requestId, {
          category: 'technical-context',
          summaryDetail: 'The desktop app received a bridge response with no pending request.'
        });
        return;
      }

      this.pendingRequests.delete(parsedMessage.requestId);
      clearTimeout(pendingRequest.timeout);
      pendingRequest.resolve(parsedMessage);
      return;
    }

    if (isBridgeEventMessage(parsedMessage)) {
      this.routeBridgeEvent(parsedMessage);
      return;
    }

    this.appendDiagnostic('warning', 'electron-main', 'Bridge emitted an unknown message shape.', line, {
      category: 'technical-context',
      summaryDetail: 'The native bridge emitted a message with an unexpected shape.'
    });
  }

  private routeBridgeEvent(event: BridgeEvent): void {
    if (event.type === 'diagnostics.appended') {
      this.recordDiagnostic(event.payload as DiagnosticsEvent);
    }

    if (event.type === 'bridge.healthChanged') {
      this.health = event.payload as BridgeHealth;
      this.refreshReadinessForCurrentHealth();
    }

    if (event.type === 'connection.stateChanged') {
      this.connectionSnapshot = event.payload as ConnectionStateChangedPayload;
    }

    if (event.type === 'capabilities.updated') {
      this.readiness = this.mergeReadinessWithHealth(event.payload as CommunicationReadiness);
    }

    this.broadcast(event);
  }

  private setHealth(status: BridgeHealth['status'], reason: string | null, bridgePath: string | null): void {
    this.health = {
      status,
      reason,
      checkedAt: getCurrentTimestamp(),
      bridgePath
    };

    this.broadcast({
      type: 'bridge.healthChanged',
      payload: this.health
    });
    this.refreshReadinessForCurrentHealth();
  }

  private emitConnectionState(
    state: ConnectionStateChangedPayload['state'],
    activity: ConnectionStateChangedPayload['activity'],
    deviceId: string | null,
    detail: string | null
  ): void {
    this.connectionSnapshot = {
      state,
      activity,
      deviceId,
      detail,
      updatedAt: getCurrentTimestamp()
    };

    this.broadcast({
      type: 'connection.stateChanged',
      payload: this.connectionSnapshot
    });
  }

  private appendDiagnostic(
    severity: DiagnosticsSeverity,
    source: DiagnosticsSource,
    title: string,
    detail: string | null,
    options: DiagnosticOptions = {}
  ): void {
    const timestamp = getCurrentTimestamp();
    const summaryId = randomUUID();
    const advancedEntry: AdvancedDiagnosticEntry | null =
      detail === null || detail.trim().length === 0
        ? null
        : {
            id: randomUUID(),
            summaryId,
            timestamp,
            severity,
            source,
            category: options.category ?? 'general',
            label: options.advancedLabel ?? 'Advanced detail',
            detail
          };

    const diagnosticsEvent: DiagnosticsEvent = {
      summary: {
        id: summaryId,
        timestamp,
        severity,
        source,
        title,
        detail: options.summaryDetail ?? summarizeDetail(detail, options.category ?? 'general')
      },
      advanced: advancedEntry
    };

    this.recordDiagnostic(diagnosticsEvent);
    this.broadcast({
      type: 'diagnostics.appended',
      payload: diagnosticsEvent
    });
  }

  private recordDiagnostic(diagnostic: DiagnosticsEvent): void {
    this.diagnostics.summary.push(diagnostic.summary);
    if (diagnostic.advanced !== null) {
      this.diagnostics.advanced.push(diagnostic.advanced);
    }

    if (this.diagnostics.summary.length > 200) {
      const removedEntries = this.diagnostics.summary.splice(0, this.diagnostics.summary.length - 200);
      const removedIds = new Set(removedEntries.map((entry) => entry.id));
      this.diagnostics.advanced = this.diagnostics.advanced.filter(
        (entry): entry is AdvancedDiagnosticEntry => entry !== undefined && !removedIds.has(entry.summaryId)
      );
    }

    if (this.diagnostics.advanced.length > 200) {
      this.diagnostics.advanced.splice(0, this.diagnostics.advanced.length - 200);
    }
  }

  private refreshReadinessForCurrentHealth(): void {
    this.readiness = this.mergeReadinessWithHealth(this.readiness);
    this.broadcast({
      type: 'capabilities.updated',
      payload: this.readiness
    });
  }

  private mergeReadinessWithHealth(readiness: CommunicationReadiness): CommunicationReadiness {
    const bridgeHealth = mapBridgeHealthStatusToCapabilityHealth(this.health.status);
    if (this.health.status === 'healthy') {
      return {
        ...readiness,
        bridgeHealth,
        checkedAt: getCurrentTimestamp()
      };
    }

    return {
      ...readiness,
      bridgeHealth,
      mediaAudio:
        readiness.mediaAudio.state === 'unknown'
          ? {
              state: 'unknown',
              reason: this.health.reason ?? readiness.mediaAudio.reason
            }
          : readiness.mediaAudio,
      readinessReason: this.health.reason ?? readiness.readinessReason,
      currentLimitation:
        this.health.reason ?? 'The native bridge is unavailable or degraded, so live readiness cannot be fully verified.',
      readinessDetails: this.health.reason ?? readiness.readinessDetails,
      confidence: readiness.confidence === 'high' ? 'medium' : readiness.confidence,
      checkedAt: getCurrentTimestamp()
    };
  }

  private failPendingRequests(error: UserFacingError): void {
    for (const [requestId, pendingRequest] of this.pendingRequests.entries()) {
      clearTimeout(pendingRequest.timeout);
      pendingRequest.resolve({ requestId, ok: false, error });
    }

    this.pendingRequests.clear();
  }

  private createError(
    code: UserFacingErrorCode,
    message: string,
    recoverable: boolean,
    suggestedAction: string | null
  ): UserFacingError {
    return {
      code,
      message,
      recoverable,
      suggestedAction
    };
  }
}
