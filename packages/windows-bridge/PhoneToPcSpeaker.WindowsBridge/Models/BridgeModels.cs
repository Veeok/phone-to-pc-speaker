using System.Text.Json;

namespace PhoneToPcSpeaker.WindowsBridge.Models;

public static class BridgeMessageTypes
{
    public const string BridgePing = "bridge.ping";
    public const string DevicesRefresh = "devices.refresh";
    public const string ConnectionEnable = "connection.enable";
    public const string ConnectionOpen = "connection.open";
    public const string ConnectionRelease = "connection.release";
    public const string DiagnosticsGetRecent = "diagnostics.getRecent";
    public const string CapabilitiesGetCurrent = "capabilities.getCurrent";
    public const string MediaSessionGetCurrent = "media.session.getCurrent";
    public const string MediaSessionSendCommand = "media.session.sendCommand";

    public const string DevicesUpdated = "devices.updated";
    public const string ConnectionStateChanged = "connection.stateChanged";
    public const string DiagnosticsAppended = "diagnostics.appended";
    public const string BridgeHealthChanged = "bridge.healthChanged";
    public const string CapabilitiesUpdated = "capabilities.updated";
    public const string VisualizerSignalUpdated = "visualizer.signalUpdated";
    public const string MediaSessionUpdated = "media.sessionUpdated";
}

public static class MediaSessionStates
{
    public const string Unavailable = "unavailable";
    public const string Available = "available";
}

public static class MediaPlaybackStates
{
    public const string Unknown = "unknown";
    public const string Opened = "opened";
    public const string Changing = "changing";
    public const string Stopped = "stopped";
    public const string Playing = "playing";
    public const string Paused = "paused";
}

public static class MediaRemoteTransportCommands
{
    public const string Play = "play";
    public const string Pause = "pause";
    public const string TogglePlayPause = "toggle-play-pause";
    public const string Next = "next";
    public const string Previous = "previous";
}

public static class MediaAbsoluteVolumeBehaviors
{
    public const string Unsupported = "unsupported";
}

public static class ConnectionStates
{
    public const string Disconnected = "Disconnected";
    public const string Ready = "Ready";
    public const string Connecting = "Connecting";
    public const string Connected = "Connected";
    public const string Failed = "Failed";
}

public static class ConnectionActivities
{
    public const string None = "none";
    public const string RefreshingDevices = "refreshing-devices";
    public const string EnablingConnection = "enabling-connection";
    public const string OpeningConnection = "opening-connection";
    public const string ReleasingConnection = "releasing-connection";
    public const string LoadingDiagnostics = "loading-diagnostics";
}

public static class BridgeHealthStatuses
{
    public const string Starting = "starting";
    public const string Healthy = "healthy";
    public const string Unavailable = "unavailable";
    public const string Degraded = "degraded";
}

public static class CapabilityBridgeHealthStates
{
    public const string Healthy = "healthy";
    public const string Degraded = "degraded";
    public const string Failed = "failed";
}

public static class CapabilityStates
{
    public const string Supported = "supported";
    public const string Unsupported = "unsupported";
    public const string Unknown = "unknown";
}

public static class CapabilityEnvironmentStates
{
    public const string Ready = "ready";
    public const string Blocked = "blocked";
    public const string Unknown = "unknown";
}

public static class CapabilityConfidences
{
    public const string High = "high";
    public const string Medium = "medium";
    public const string Low = "low";
}

public static class DiagnosticsSeverities
{
    public const string Info = "info";
    public const string Warning = "warning";
    public const string Error = "error";
}

public static class DiagnosticsSources
{
    public const string Renderer = "renderer";
    public const string ElectronMain = "electron-main";
    public const string Preload = "preload";
    public const string WindowsBridge = "windows-bridge";
    public const string NativeAudio = "native-audio";
}

public static class DiagnosticsCategories
{
    public const string General = "general";
    public const string BridgeLog = "bridge-log";
    public const string NativeDetail = "native-detail";
    public const string DeviceIdentifier = "device-identifier";
    public const string CapabilityProbe = "capability-probe";
    public const string TechnicalContext = "technical-context";
}

public static class UserFacingErrorCodes
{
    public const string BridgeUnavailable = "BRIDGE_UNAVAILABLE";
    public const string BridgeRequestFailed = "BRIDGE_REQUEST_FAILED";
    public const string DeviceNotFound = "DEVICE_NOT_FOUND";
    public const string DeviceNotSelected = "DEVICE_NOT_SELECTED";
    public const string ConnectionEnableFailed = "CONNECTION_ENABLE_FAILED";
    public const string ConnectionOpenFailed = "CONNECTION_OPEN_FAILED";
    public const string ConnectionReleaseFailed = "CONNECTION_RELEASE_FAILED";
    public const string DiagnosticsUnavailable = "DIAGNOSTICS_UNAVAILABLE";
    public const string CapabilityProbeInconclusive = "CAPABILITY_PROBE_INCONCLUSIVE";
    public const string UnsupportedPath = "UNSUPPORTED_PATH";
    public const string InternalError = "INTERNAL_ERROR";
}

public sealed class BridgeRequestEnvelope
{
    public string Id { get; set; } = string.Empty;

    public string Type { get; set; } = string.Empty;

    public JsonElement Payload { get; set; }
}

public sealed class BridgeResponseEnvelope<TPayload>
{
    public string RequestId { get; init; } = string.Empty;

    public bool Ok { get; init; }

    public TPayload? Payload { get; init; }

    public UserFacingErrorModel? Error { get; init; }
}

public sealed class BridgeEventEnvelope<TPayload>
{
    public string Type { get; init; } = string.Empty;

    public required TPayload Payload { get; init; }
}

public sealed class DeviceSummaryModel
{
    public string Id { get; init; } = string.Empty;

    public string Name { get; init; } = string.Empty;

    public bool IsPaired { get; init; }

    public bool CanConnect { get; init; }

    public bool IsConnected { get; init; }

    public int? BatteryPercent { get; init; }

    public string? Manufacturer { get; init; }

    public string? ModelName { get; init; }

    public string LastSeenAt { get; init; } = string.Empty;
}

public sealed class BridgeHealthModel
{
    public string Status { get; init; } = BridgeHealthStatuses.Starting;

    public string? Reason { get; init; }

    public string CheckedAt { get; init; } = string.Empty;

    public string? BridgePath { get; init; }
}

public sealed class MediaCapabilityModel
{
    public string State { get; init; } = CapabilityStates.Unknown;

    public string Reason { get; init; } = string.Empty;
}

public sealed class CallCapabilityModel
{
    public string State { get; init; } = CapabilityStates.Unknown;

    public string Reason { get; init; } = string.Empty;
}

public sealed class CommunicationReadinessModel
{
    public required MediaCapabilityModel MediaAudio { get; init; }

    public required CallCapabilityModel CallAudio { get; init; }

    public string BridgeHealth { get; init; } = CapabilityBridgeHealthStates.Degraded;

    public string PlatformReadiness { get; init; } = CapabilityEnvironmentStates.Unknown;

    public string HardwareReadiness { get; init; } = CapabilityEnvironmentStates.Unknown;

    public string Confidence { get; init; } = CapabilityConfidences.Low;

    public string ReadinessReason { get; init; } = string.Empty;

    public string CurrentLimitation { get; init; } = string.Empty;

    public string? ReadinessDetails { get; init; }

    public string CheckedAt { get; init; } = string.Empty;
}

public sealed class SummaryDiagnosticEntryModel
{
    public string Id { get; init; } = string.Empty;

    public string Timestamp { get; init; } = string.Empty;

    public string Severity { get; init; } = DiagnosticsSeverities.Info;

    public string Source { get; init; } = DiagnosticsSources.WindowsBridge;

    public string Title { get; init; } = string.Empty;

    public string? Detail { get; init; }
}

public sealed class AdvancedDiagnosticEntryModel
{
    public string Id { get; init; } = string.Empty;

    public string SummaryId { get; init; } = string.Empty;

    public string Timestamp { get; init; } = string.Empty;

    public string Severity { get; init; } = DiagnosticsSeverities.Info;

    public string Source { get; init; } = DiagnosticsSources.WindowsBridge;

    public string Category { get; init; } = DiagnosticsCategories.General;

    public string Label { get; init; } = string.Empty;

    public string? Detail { get; init; }
}

public sealed class DiagnosticsEventModel
{
    public required SummaryDiagnosticEntryModel Summary { get; init; }

    public AdvancedDiagnosticEntryModel? Advanced { get; init; }
}

public sealed class DiagnosticsSnapshotModel
{
    public List<SummaryDiagnosticEntryModel> Summary { get; init; } = [];

    public List<AdvancedDiagnosticEntryModel> Advanced { get; init; } = [];
}

public sealed class UserFacingErrorModel
{
    public string Code { get; init; } = UserFacingErrorCodes.InternalError;

    public string Message { get; init; } = string.Empty;

    public bool Recoverable { get; init; }

    public string? SuggestedAction { get; init; }
}

public sealed class ConnectionCommandPayload
{
    public string DeviceId { get; init; } = string.Empty;
}

public sealed class ConnectionReleasePayload
{
    public string? DeviceId { get; init; }
}

public sealed class DiagnosticsGetRecentPayload
{
    public int? Limit { get; init; }
}

public sealed class BridgePingResponsePayload
{
    public required BridgeHealthModel Health { get; init; }
}

public sealed class DevicesRefreshResponsePayload
{
    public List<DeviceSummaryModel> Devices { get; init; } = [];
}

public sealed class ConnectionActionResponsePayload
{
    public string State { get; init; } = ConnectionStates.Disconnected;

    public string Activity { get; init; } = ConnectionActivities.None;

    public string? DeviceId { get; init; }

    public string? Detail { get; init; }

    public string UpdatedAt { get; init; } = string.Empty;
}

public sealed class DiagnosticsGetRecentResponsePayload
{
    public required DiagnosticsSnapshotModel Diagnostics { get; init; }
}

public sealed class CapabilitiesGetCurrentResponsePayload
{
    public required CommunicationReadinessModel Readiness { get; init; }
}

public sealed class DevicesUpdatedPayload
{
    public List<DeviceSummaryModel> Devices { get; init; } = [];
}

public sealed class MediaRemoteSessionMetadataModel
{
    public string? Title { get; init; }

    public string? Artist { get; init; }

    public string? AlbumTitle { get; init; }

    public string? AlbumArtist { get; init; }
}

public sealed class MediaRemoteSessionControlsModel
{
    public bool CanPlay { get; init; }

    public bool CanPause { get; init; }

    public bool CanTogglePlayPause { get; init; }

    public bool CanNext { get; init; }

    public bool CanPrevious { get; init; }
}

public sealed class MediaRemoteSessionSnapshotModel
{
    public string State { get; init; } = MediaSessionStates.Unavailable;

    public string PlaybackState { get; init; } = MediaPlaybackStates.Unknown;

    public required MediaRemoteSessionMetadataModel Metadata { get; init; }

    public required MediaRemoteSessionControlsModel Controls { get; init; }

    public string? SourceAppUserModelId { get; init; }

    public string Detail { get; init; } = string.Empty;

    public string AbsoluteVolumeBehavior { get; init; } = MediaAbsoluteVolumeBehaviors.Unsupported;

    public string AbsoluteVolumeDetail { get; init; } = string.Empty;

    public int SessionCount { get; init; }

    public string UpdatedAt { get; init; } = string.Empty;
}

public sealed class MediaRemoteSessionGetCurrentResponsePayload
{
    public required MediaRemoteSessionSnapshotModel Session { get; init; }
}

public sealed class MediaRemoteTransportCommandPayload
{
    public string Command { get; init; } = string.Empty;
}

public sealed class MediaRemoteTransportCommandResponsePayload
{
    public required MediaRemoteSessionSnapshotModel Session { get; init; }
}

public sealed class AudioVisualizerSignalModel
{
    public double Low { get; init; }

    public double Mid { get; init; }

    public double High { get; init; }

    public double Bass { get; init; }

    public double LowMids { get; init; }

    public double Mids { get; init; }

    public double Presence { get; init; }

    public double Treble { get; init; }

    public double Air { get; init; }

    public double VocalPresence { get; init; }

    public double InstrumentPresence { get; init; }

    public double Warmth { get; init; }

    public double Clarity { get; init; }

    public double Brightness { get; init; }

    public double Punch { get; init; }

    public double Transient { get; init; }

    public double Energy { get; init; }

    public bool IsActive { get; init; }

    public string CapturedAt { get; init; } = string.Empty;
}

public sealed class ConnectionStateChangedPayload
{
    public string State { get; init; } = ConnectionStates.Disconnected;

    public string Activity { get; init; } = ConnectionActivities.None;

    public string? DeviceId { get; init; }

    public string? Detail { get; init; }

    public string UpdatedAt { get; init; } = string.Empty;
}
