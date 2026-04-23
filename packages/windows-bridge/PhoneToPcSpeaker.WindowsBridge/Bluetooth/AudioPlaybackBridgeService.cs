using System.Runtime.InteropServices.WindowsRuntime;
using PhoneToPcSpeaker.WindowsBridge.Audio;
using PhoneToPcSpeaker.WindowsBridge.Diagnostics;
using PhoneToPcSpeaker.WindowsBridge.Models;
using Windows.Devices.Enumeration;
using Windows.Media.Audio;
using Windows.Media.Control;

namespace PhoneToPcSpeaker.WindowsBridge.Bluetooth;

public sealed class AudioPlaybackBridgeService : IAsyncDisposable
{
    private static readonly string[] RequestedDeviceProperties =
    [
        "System.Devices.Aep.IsConnected",
        "System.Devices.Aep.Bluetooth.BatteryLevel",
        "System.Devices.Aep.Manufacturer",
        "System.Devices.Aep.ModelName"
    ];

    private readonly object _syncRoot = new();
    private readonly BridgeDiagnostics _diagnostics;
    private readonly LoopbackSpectrumMonitor _visualizerMonitor;
    private readonly Dictionary<string, DeviceSummaryModel> _deviceRegistry = new(StringComparer.Ordinal);
    private DeviceWatcher? _deviceWatcher;
    private AudioPlaybackConnection? _activeConnection;
    private GlobalSystemMediaTransportControlsSessionManager? _mediaSessionManager;
    private GlobalSystemMediaTransportControlsSession? _currentMediaSession;
    private string? _activeDeviceId;
    private bool _releaseInProgress;
    private bool _platformProbeSucceeded;
    private string? _lastPlatformFailureDetail;
    private string? _lastHardwareFailureDetail;
    private string? _lastMediaSessionFailureDetail;
    private long _deviceSnapshotVersion;

    public AudioPlaybackBridgeService(BridgeDiagnostics diagnostics)
    {
        _diagnostics = diagnostics;
        _visualizerMonitor = new LoopbackSpectrumMonitor(_diagnostics);
        _visualizerMonitor.SignalUpdated += (payload) => VisualizerSignalUpdated?.Invoke(payload);
        CurrentHealth = new BridgeHealthModel
        {
            Status = BridgeHealthStatuses.Starting,
            Reason = "Bridge service is initializing.",
            CheckedAt = DateTimeOffset.UtcNow.ToString("O"),
            BridgePath = null
        };
        CurrentReadiness = BuildReadinessSnapshot();
        CurrentMediaSession = CreateUnavailableMediaSessionSnapshot(
            "Track info and remote controls appear only when Windows exposes the connected phone as the current media session.");
    }

    public BridgeHealthModel CurrentHealth { get; private set; }

    public CommunicationReadinessModel CurrentReadiness { get; private set; }

    public MediaRemoteSessionSnapshotModel CurrentMediaSession { get; private set; }

    public event Action<DevicesUpdatedPayload>? DevicesUpdated;

    public event Action<ConnectionStateChangedPayload>? ConnectionStateChanged;

    public event Action<BridgeHealthModel>? BridgeHealthChanged;

    public event Action<CommunicationReadinessModel>? CapabilitiesUpdated;

    public event Action<AudioVisualizerSignalModel>? VisualizerSignalUpdated;

    public event Action<MediaRemoteSessionSnapshotModel>? MediaSessionUpdated;

    public async Task InitializeAsync(CancellationToken cancellationToken)
    {
        try
        {
            await EnsureWatcherStartedAsync(cancellationToken);
            SetHealth(BridgeHealthStatuses.Healthy, null);
            _diagnostics.Info(
                "Capability probe completed for media audio.",
                "Windows AudioPlaybackConnection APIs are available in this environment.",
                source: DiagnosticsSources.WindowsBridge,
                category: DiagnosticsCategories.CapabilityProbe,
                summaryDetail: "Media-audio platform probing succeeded.");
        }
        catch (Exception exception)
        {
            _lastPlatformFailureDetail = exception.Message;
            _diagnostics.Error(
                "Capability probe failed during bridge initialization.",
                exception.Message,
                source: DiagnosticsSources.WindowsBridge,
                category: DiagnosticsCategories.CapabilityProbe,
                summaryDetail: "Media-audio readiness could not be fully validated.");
            SetHealth(BridgeHealthStatuses.Degraded, exception.Message);
        }

        await TryInitializeMediaSessionManagerAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<DeviceSummaryModel>> RefreshDevicesAsync(CancellationToken cancellationToken)
    {
        string selector = AudioPlaybackConnection.GetDeviceSelector();
        IReadOnlyList<DeviceInformation> discoveredDevices;

        try
        {
            discoveredDevices = await DeviceInformation.FindAllAsync(selector).AsTask(cancellationToken);
        }
        catch (Exception exception)
        {
            _diagnostics.Error(
                "Eligible device refresh failed.",
                exception.Message,
                source: DiagnosticsSources.WindowsBridge,
                category: DiagnosticsCategories.CapabilityProbe,
                summaryDetail: "Windows could not enumerate eligible Bluetooth devices.");
            throw;
        }

        List<DeviceSummaryModel> orderedDevices = discoveredDevices
            .Select(MapDevice)
            .OrderByDescending((device) => device.CanConnect)
            .ThenBy((device) => device.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        lock (_syncRoot)
        {
            _deviceRegistry.Clear();
            foreach (DeviceSummaryModel device in orderedDevices)
            {
                _deviceRegistry[device.Id] = device;
            }
        }

        long snapshotVersion = Interlocked.Increment(ref _deviceSnapshotVersion);

        _platformProbeSucceeded = true;
        _lastPlatformFailureDetail = null;
        UpdateReadiness();

        _diagnostics.Info(
            "Eligible device refresh completed.",
            selector,
            source: DiagnosticsSources.NativeAudio,
            category: DiagnosticsCategories.TechnicalContext,
            summaryDetail: $"{orderedDevices.Count} eligible device(s) available.",
            advancedLabel: "AudioPlaybackConnection selector");

        DevicesUpdated?.Invoke(new DevicesUpdatedPayload { Devices = orderedDevices });
        _ = TryEnrichDevicesAsync(snapshotVersion, orderedDevices, CancellationToken.None);
        return orderedDevices;
    }

    public async Task<ConnectionActionResponsePayload> EnableConnectionAsync(string deviceId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(deviceId))
        {
            throw new InvalidOperationException("A device id is required to enable a connection.");
        }

        EmitConnectionState(ConnectionStates.Disconnected, ConnectionActivities.EnablingConnection, deviceId, "Enabling media-audio connection.");
        await EnsureWatcherStartedAsync(cancellationToken);
        IReadOnlyList<DeviceSummaryModel> devices = await RefreshDevicesAsync(cancellationToken);
        if (devices.All((device) => !string.Equals(device.Id, deviceId, StringComparison.Ordinal)))
        {
            throw new InvalidOperationException($"Eligible device not found for id '{deviceId}'.");
        }

        AudioPlaybackConnection connection = EnsureConnection(deviceId);
        _diagnostics.Info(
            "Starting media-audio connection.",
            deviceId,
            source: DiagnosticsSources.NativeAudio,
            category: DiagnosticsCategories.DeviceIdentifier,
            summaryDetail: "Preparing the selected device for media playback.",
            advancedLabel: "Selected device id");

        await connection.StartAsync().AsTask(cancellationToken);
        _lastHardwareFailureDetail = null;
        UpdateReadiness();

        return CreateConnectionResponse(
            ConnectionStates.Ready,
            ConnectionActivities.None,
            deviceId,
            "Connection enabled and ready to open.",
            emitEvent: true);
    }

    public async Task<ConnectionActionResponsePayload> OpenConnectionAsync(string deviceId, CancellationToken cancellationToken)
    {
        AudioPlaybackConnection connection = GetActiveConnection(deviceId);

        EmitConnectionState(ConnectionStates.Connecting, ConnectionActivities.OpeningConnection, deviceId, "Opening media-audio connection.");
        _diagnostics.Info(
            "Opening media-audio connection.",
            deviceId,
            source: DiagnosticsSources.NativeAudio,
            category: DiagnosticsCategories.DeviceIdentifier,
            summaryDetail: "Attempting to route the selected phone's media audio.",
            advancedLabel: "Selected device id");

        AudioPlaybackConnectionOpenResult result = await connection.OpenAsync().AsTask(cancellationToken);
        string extendedError = result.ExtendedError is null
            ? "No extended error."
            : $"{result.ExtendedError.Message} (HRESULT 0x{result.ExtendedError.HResult:X8})";

        if (result.Status == AudioPlaybackConnectionOpenResultStatus.Success)
        {
            _lastHardwareFailureDetail = null;
            UpdateReadiness();
            await StartVisualizerMonitorAsync();
            await TryInitializeMediaSessionManagerAsync(cancellationToken);
            await RefreshMediaSessionSnapshotAsync(cancellationToken);
            _diagnostics.Info(
                "Open connection succeeded.",
                extendedError,
                source: DiagnosticsSources.NativeAudio,
                category: DiagnosticsCategories.NativeDetail,
                summaryDetail: "Remote media audio is now routed to this PC.",
                advancedLabel: "Native open result");
            _diagnostics.Info(
                "Bluetooth volume sync remains device-dependent.",
                "AudioPlaybackConnection exposes connection lifecycle only. It does not expose remote volume events, AVRCP absolute-volume hooks, or a connection-level gain control. The bridge preserves the current Windows output volume. If Android volume buttons change loudness during playback, that behavior comes from the phone or the Windows audio stack outside this bridge.",
                source: DiagnosticsSources.WindowsBridge,
                category: DiagnosticsCategories.CapabilityProbe,
                summaryDetail: "The app does not claim phone-to-Windows volume synchronization on this path.",
                advancedLabel: "Volume sync limitation");
            _diagnostics.Info(
                "Manual volume test is available during playback.",
                "While audio is playing, keep Windows output volume unchanged and press Android volume up and down. If Windows volume visibly changes, that is OS-managed endpoint behavior outside this bridge. If loudness changes while Windows volume stays fixed, the phone is likely attenuating the transmitted media stream. If neither changes, no observable volume linkage is present on this device pair.",
                source: DiagnosticsSources.WindowsBridge,
                category: DiagnosticsCategories.TechnicalContext,
                summaryDetail: "During playback, press Android volume up/down and observe: Windows volume changed, loudness changed but Windows volume did not, or no observable linkage.",
                advancedLabel: "Manual volume test guidance");

            return CreateConnectionResponse(
                ConnectionStates.Connected,
                ConnectionActivities.None,
                deviceId,
                "Remote device media audio is now routed to this PC output.",
                emitEvent: true);
        }

        string failureDetail = $"OpenAsync returned {result.Status}. {extendedError}";
        _lastHardwareFailureDetail = failureDetail;
        UpdateReadiness();
        _diagnostics.Error(
            "Open connection failed.",
            failureDetail,
            source: DiagnosticsSources.NativeAudio,
            category: DiagnosticsCategories.NativeDetail,
            summaryDetail: "Windows did not complete the media-audio open request.",
            advancedLabel: "Native open failure");
        EmitConnectionState(ConnectionStates.Failed, ConnectionActivities.None, deviceId, failureDetail);
        throw new InvalidOperationException(failureDetail);
    }

    public async Task<ConnectionActionResponsePayload> ReleaseConnectionAsync(string? deviceId)
    {
        AudioPlaybackConnection? connection;
        string? activeDeviceId;

        lock (_syncRoot)
        {
            connection = _activeConnection;
            activeDeviceId = _activeDeviceId ?? deviceId;
            _releaseInProgress = true;
            _activeConnection = null;
            _activeDeviceId = null;
        }

        if (connection is null)
        {
            return CreateConnectionResponse(
                ConnectionStates.Disconnected,
                ConnectionActivities.None,
                activeDeviceId,
                "No active connection to release.",
                emitEvent: false);
        }

        EmitConnectionState(ConnectionStates.Ready, ConnectionActivities.ReleasingConnection, activeDeviceId, "Releasing media-audio connection.");

        try
        {
            await _visualizerMonitor.StopAsync();
            ClearCurrentMediaSession();
            connection.StateChanged -= OnConnectionStateChanged;
            connection.Dispose();
            _diagnostics.Info(
                "Release connection succeeded.",
                activeDeviceId,
                source: DiagnosticsSources.NativeAudio,
                category: DiagnosticsCategories.DeviceIdentifier,
                summaryDetail: "The media-audio connection was released cleanly.",
                advancedLabel: "Released device id");

            return CreateConnectionResponse(
                ConnectionStates.Disconnected,
                ConnectionActivities.None,
                activeDeviceId,
                "Connection released.",
                emitEvent: true);
        }
        catch (Exception exception)
        {
            _diagnostics.Error(
                "Release connection failed.",
                exception.Message,
                source: DiagnosticsSources.NativeAudio,
                category: DiagnosticsCategories.NativeDetail,
                summaryDetail: "Windows reported an error while releasing the connection.",
                advancedLabel: "Release failure detail");
            EmitConnectionState(ConnectionStates.Failed, ConnectionActivities.None, activeDeviceId, exception.Message);
            throw;
        }
        finally
        {
            lock (_syncRoot)
            {
                _releaseInProgress = false;
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        await ReleaseConnectionAsync(_activeDeviceId);
        StopMediaSessionManager();
        ClearCurrentMediaSession();
        await _visualizerMonitor.DisposeAsync();
        StopWatcher();
    }

    public async Task<MediaRemoteTransportCommandResponsePayload> SendMediaRemoteCommandAsync(string command, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command))
        {
            throw new InvalidOperationException("A media transport command is required.");
        }

        if (!IsConnectionOpened())
        {
            throw new InvalidOperationException("Open Connection must succeed before phone media controls are available.");
        }

        await TryInitializeMediaSessionManagerAsync(cancellationToken);
        GlobalSystemMediaTransportControlsSession session = await ResolveCurrentMediaSessionAsync(cancellationToken);
        GlobalSystemMediaTransportControlsSessionPlaybackInfo playbackInfo = session.GetPlaybackInfo();
        GlobalSystemMediaTransportControlsSessionPlaybackControls? controls = playbackInfo.Controls;

        bool succeeded = command switch
        {
            MediaRemoteTransportCommands.Play when controls?.IsPlayEnabled == true => await session.TryPlayAsync().AsTask(cancellationToken),
            MediaRemoteTransportCommands.Pause when controls?.IsPauseEnabled == true => await session.TryPauseAsync().AsTask(cancellationToken),
            MediaRemoteTransportCommands.TogglePlayPause when controls?.IsPlayPauseToggleEnabled == true => await session.TryTogglePlayPauseAsync().AsTask(cancellationToken),
            MediaRemoteTransportCommands.Next when controls?.IsNextEnabled == true => await session.TrySkipNextAsync().AsTask(cancellationToken),
            MediaRemoteTransportCommands.Previous when controls?.IsPreviousEnabled == true => await session.TrySkipPreviousAsync().AsTask(cancellationToken),
            _ => throw new InvalidOperationException($"The current Windows media session does not support the '{command}' command.")
        };

        if (!succeeded)
        {
            throw new InvalidOperationException($"Windows rejected the '{command}' request for the current media session.");
        }

        _diagnostics.Info(
            "Sent a remote media command through Windows.",
            command,
            source: DiagnosticsSources.WindowsBridge,
            category: DiagnosticsCategories.TechnicalContext,
            summaryDetail: "The app sent a play, pause, or track-skip request to the current Windows media session.",
            advancedLabel: "Media transport command");

        await RefreshMediaSessionSnapshotAsync(cancellationToken);
        return new MediaRemoteTransportCommandResponsePayload
        {
            Session = CurrentMediaSession
        };
    }

    private async Task EnsureWatcherStartedAsync(CancellationToken cancellationToken)
    {
        if (_deviceWatcher is not null)
        {
            return;
        }

        string selector = AudioPlaybackConnection.GetDeviceSelector();
        DeviceWatcher watcher = DeviceInformation.CreateWatcher(selector);
        watcher.Added += OnDeviceAdded;
        watcher.Updated += OnDeviceUpdated;
        watcher.Removed += OnDeviceRemoved;
        watcher.EnumerationCompleted += OnEnumerationCompleted;
        watcher.Stopped += OnWatcherStopped;

        lock (_syncRoot)
        {
            _deviceWatcher = watcher;
        }

        _diagnostics.Info(
            "Starting eligible-device watcher.",
            selector,
            source: DiagnosticsSources.WindowsBridge,
            category: DiagnosticsCategories.TechnicalContext,
            summaryDetail: "Watching Windows for eligible remote media devices.",
            advancedLabel: "Watcher selector");

        watcher.Start();
        await RefreshDevicesAsync(cancellationToken);
    }

    private AudioPlaybackConnection EnsureConnection(string deviceId)
    {
        lock (_syncRoot)
        {
            if (_activeConnection is not null)
            {
                if (!string.Equals(_activeDeviceId, deviceId, StringComparison.Ordinal))
                {
                    throw new InvalidOperationException("Release the active device before enabling a different device.");
                }

                return _activeConnection;
            }

            _diagnostics.Info(
                "Creating native media-audio connection handle.",
                deviceId,
                source: DiagnosticsSources.NativeAudio,
                category: DiagnosticsCategories.DeviceIdentifier,
                summaryDetail: "Windows is creating a connection handle for the selected device.",
                advancedLabel: "Selected device id");

            AudioPlaybackConnection? connection = AudioPlaybackConnection.TryCreateFromId(deviceId);
            if (connection is null)
            {
                throw new InvalidOperationException($"AudioPlaybackConnection.TryCreateFromId returned null for device '{deviceId}'.");
            }

            connection.StateChanged += OnConnectionStateChanged;
            _activeConnection = connection;
            _activeDeviceId = deviceId;
            return connection;
        }
    }

    private AudioPlaybackConnection GetActiveConnection(string deviceId)
    {
        lock (_syncRoot)
        {
            if (_activeConnection is null || !string.Equals(_activeDeviceId, deviceId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Enable Connection must succeed before Open Connection.");
            }

            return _activeConnection;
        }
    }

    private void StopWatcher()
    {
        DeviceWatcher? watcher;

        lock (_syncRoot)
        {
            watcher = _deviceWatcher;
            _deviceWatcher = null;
        }

        if (watcher is null)
        {
            return;
        }

        watcher.Added -= OnDeviceAdded;
        watcher.Updated -= OnDeviceUpdated;
        watcher.Removed -= OnDeviceRemoved;
        watcher.EnumerationCompleted -= OnEnumerationCompleted;
        watcher.Stopped -= OnWatcherStopped;

        if (watcher.Status is DeviceWatcherStatus.Started or DeviceWatcherStatus.EnumerationCompleted)
        {
            _diagnostics.Info(
                "Stopping eligible-device watcher.",
                watcher.Status.ToString(),
                source: DiagnosticsSources.WindowsBridge,
                category: DiagnosticsCategories.TechnicalContext,
                summaryDetail: "The eligible-device watcher is shutting down.");
            watcher.Stop();
        }
    }

    private async Task TryInitializeMediaSessionManagerAsync(CancellationToken cancellationToken)
    {
        if (_mediaSessionManager is not null)
        {
            return;
        }

        try
        {
            GlobalSystemMediaTransportControlsSessionManager manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync().AsTask(cancellationToken);
            _mediaSessionManager = manager;
            manager.SessionsChanged += OnMediaSessionsChanged;
            manager.CurrentSessionChanged += OnCurrentMediaSessionChanged;
            _lastMediaSessionFailureDetail = null;
            _diagnostics.Info(
                "Windows current-session media access is available.",
                "The bridge can observe the current Windows media session for metadata and transport control when Bluetooth playback exposes one.",
                source: DiagnosticsSources.WindowsBridge,
                category: DiagnosticsCategories.CapabilityProbe,
                summaryDetail: "Track metadata and transport control probing is available on this Windows setup.");
        }
        catch (Exception exception)
        {
            _lastMediaSessionFailureDetail = exception.Message;
            _diagnostics.Warning(
                "Windows current-session media access is unavailable.",
                exception.Message,
                source: DiagnosticsSources.WindowsBridge,
                category: DiagnosticsCategories.CapabilityProbe,
                summaryDetail: "Track metadata and transport controls are unavailable on this Windows setup.");
            UpdateReadiness();
            SetCurrentMediaSession(CreateUnavailableMediaSessionSnapshot(
                "Windows did not grant current-session media access, so track metadata and remote controls remain unavailable on this setup."));
            return;
        }

        UpdateReadiness();
    }

    private async Task RefreshMediaSessionSnapshotAsync(CancellationToken cancellationToken)
    {
        if (!IsConnectionOpened())
        {
            SetCurrentMediaSession(CreateUnavailableMediaSessionSnapshot(
                "Open Connection to surface track metadata and remote controls when Windows exposes the phone as the current media session."));
            return;
        }

        if (_mediaSessionManager is null)
        {
            SetCurrentMediaSession(CreateUnavailableMediaSessionSnapshot(
                _lastMediaSessionFailureDetail is null
                    ? "Windows media-session access is not ready yet, so remote controls remain unavailable."
                    : $"Windows media-session access is unavailable: {_lastMediaSessionFailureDetail}"));
            return;
        }

        IReadOnlyList<GlobalSystemMediaTransportControlsSession> sessions = _mediaSessionManager.GetSessions();
        GlobalSystemMediaTransportControlsSession? session = _mediaSessionManager.GetCurrentSession();
        AttachCurrentMediaSession(session);

        if (session is null)
        {
            SetCurrentMediaSession(CreateUnavailableMediaSessionSnapshot(
                "Windows did not expose a current phone media session for this playback. Track metadata and remote controls remain device- and session-dependent."));
            return;
        }

        GlobalSystemMediaTransportControlsSessionPlaybackInfo playbackInfo = session.GetPlaybackInfo();
        GlobalSystemMediaTransportControlsSessionPlaybackControls? controls = playbackInfo.Controls;
        GlobalSystemMediaTransportControlsSessionMediaProperties? mediaProperties = null;

        try
        {
            mediaProperties = await session.TryGetMediaPropertiesAsync().AsTask(cancellationToken);
        }
        catch (Exception exception)
        {
            _diagnostics.Warning(
                "Windows withheld media metadata for the current session.",
                exception.Message,
                source: DiagnosticsSources.WindowsBridge,
                category: DiagnosticsCategories.CapabilityProbe,
                summaryDetail: "Transport controls may still work, but track metadata was not available.");
        }

        string detail = sessions.Count > 1
            ? "Windows exposed a current media session while multiple sessions are present. Remote controls follow the session Windows currently prioritizes."
            : "Windows exposed the current media session for connected playback.";

        SetCurrentMediaSession(new MediaRemoteSessionSnapshotModel
        {
            State = MediaSessionStates.Available,
            PlaybackState = MapPlaybackState(playbackInfo.PlaybackStatus),
            Metadata = new MediaRemoteSessionMetadataModel
            {
                Title = ReadMediaString(mediaProperties?.Title),
                Artist = ReadMediaString(mediaProperties?.Artist),
                AlbumTitle = ReadMediaString(mediaProperties?.AlbumTitle),
                AlbumArtist = ReadMediaString(mediaProperties?.AlbumArtist)
            },
            Controls = new MediaRemoteSessionControlsModel
            {
                CanPlay = controls?.IsPlayEnabled == true,
                CanPause = controls?.IsPauseEnabled == true,
                CanTogglePlayPause = controls?.IsPlayPauseToggleEnabled == true,
                CanNext = controls?.IsNextEnabled == true,
                CanPrevious = controls?.IsPreviousEnabled == true
            },
            SourceAppUserModelId = ReadMediaString(session.SourceAppUserModelId),
            Detail = detail,
            AbsoluteVolumeBehavior = MediaAbsoluteVolumeBehaviors.Unsupported,
            AbsoluteVolumeDetail = GetAbsoluteVolumeUnsupportedDetail(),
            SessionCount = sessions.Count,
            UpdatedAt = DateTimeOffset.UtcNow.ToString("O")
        });
    }

    private async Task<GlobalSystemMediaTransportControlsSession> ResolveCurrentMediaSessionAsync(CancellationToken cancellationToken)
    {
        await RefreshMediaSessionSnapshotAsync(cancellationToken);
        if (_currentMediaSession is null || CurrentMediaSession.State != MediaSessionStates.Available)
        {
            throw new InvalidOperationException("Windows did not expose a controllable phone media session for this playback. Start playback on the phone and try again.");
        }

        return _currentMediaSession;
    }

    private void AttachCurrentMediaSession(GlobalSystemMediaTransportControlsSession? nextSession)
    {
        if (ReferenceEquals(_currentMediaSession, nextSession))
        {
            return;
        }

        if (_currentMediaSession is not null)
        {
            _currentMediaSession.MediaPropertiesChanged -= OnMediaPropertiesChanged;
            _currentMediaSession.PlaybackInfoChanged -= OnMediaPlaybackInfoChanged;
        }

        _currentMediaSession = nextSession;

        if (_currentMediaSession is not null)
        {
            _currentMediaSession.MediaPropertiesChanged += OnMediaPropertiesChanged;
            _currentMediaSession.PlaybackInfoChanged += OnMediaPlaybackInfoChanged;
        }
    }

    private void ClearCurrentMediaSession()
    {
        AttachCurrentMediaSession(null);
        SetCurrentMediaSession(CreateUnavailableMediaSessionSnapshot(
            "Track metadata and remote controls appear only while the phone media route is open and Windows exposes a current media session."));
    }

    private void StopMediaSessionManager()
    {
        if (_mediaSessionManager is not null)
        {
            _mediaSessionManager.SessionsChanged -= OnMediaSessionsChanged;
            _mediaSessionManager.CurrentSessionChanged -= OnCurrentMediaSessionChanged;
            _mediaSessionManager = null;
        }
    }

    private void SetCurrentMediaSession(MediaRemoteSessionSnapshotModel nextSnapshot)
    {
        if (AreSameMediaSessionSnapshot(CurrentMediaSession, nextSnapshot))
        {
            return;
        }

        CurrentMediaSession = nextSnapshot;
        MediaSessionUpdated?.Invoke(CurrentMediaSession);
    }

    private static MediaRemoteSessionSnapshotModel CreateUnavailableMediaSessionSnapshot(string detail)
    {
        return new MediaRemoteSessionSnapshotModel
        {
            State = MediaSessionStates.Unavailable,
            PlaybackState = MediaPlaybackStates.Unknown,
            Metadata = new MediaRemoteSessionMetadataModel
            {
                Title = null,
                Artist = null,
                AlbumTitle = null,
                AlbumArtist = null
            },
            Controls = new MediaRemoteSessionControlsModel
            {
                CanPlay = false,
                CanPause = false,
                CanTogglePlayPause = false,
                CanNext = false,
                CanPrevious = false
            },
            SourceAppUserModelId = null,
            Detail = detail,
            AbsoluteVolumeBehavior = MediaAbsoluteVolumeBehaviors.Unsupported,
            AbsoluteVolumeDetail = GetAbsoluteVolumeUnsupportedDetail(),
            SessionCount = 0,
            UpdatedAt = DateTimeOffset.UtcNow.ToString("O")
        };
    }

    private static bool AreSameMediaSessionSnapshot(MediaRemoteSessionSnapshotModel left, MediaRemoteSessionSnapshotModel right)
    {
        return left.State == right.State
            && left.PlaybackState == right.PlaybackState
            && left.Metadata.Title == right.Metadata.Title
            && left.Metadata.Artist == right.Metadata.Artist
            && left.Metadata.AlbumTitle == right.Metadata.AlbumTitle
            && left.Metadata.AlbumArtist == right.Metadata.AlbumArtist
            && left.Controls.CanPlay == right.Controls.CanPlay
            && left.Controls.CanPause == right.Controls.CanPause
            && left.Controls.CanTogglePlayPause == right.Controls.CanTogglePlayPause
            && left.Controls.CanNext == right.Controls.CanNext
            && left.Controls.CanPrevious == right.Controls.CanPrevious
            && left.SourceAppUserModelId == right.SourceAppUserModelId
            && left.Detail == right.Detail
            && left.AbsoluteVolumeBehavior == right.AbsoluteVolumeBehavior
            && left.AbsoluteVolumeDetail == right.AbsoluteVolumeDetail
            && left.SessionCount == right.SessionCount;
    }

    private bool IsConnectionOpened()
    {
        lock (_syncRoot)
        {
            return _activeConnection is not null && _activeConnection.State == AudioPlaybackConnectionState.Opened;
        }
    }

    private static string MapPlaybackState(GlobalSystemMediaTransportControlsSessionPlaybackStatus playbackStatus)
    {
        return playbackStatus switch
        {
            GlobalSystemMediaTransportControlsSessionPlaybackStatus.Opened => MediaPlaybackStates.Opened,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus.Changing => MediaPlaybackStates.Changing,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus.Stopped => MediaPlaybackStates.Stopped,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing => MediaPlaybackStates.Playing,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused => MediaPlaybackStates.Paused,
            _ => MediaPlaybackStates.Unknown
        };
    }

    private static string GetAbsoluteVolumeUnsupportedDetail()
    {
        return "AudioPlaybackConnection does not expose AVRCP absolute-volume hooks or remote volume callbacks. Any observed phone-volume linkage comes from Windows or the phone outside this bridge.";
    }

    private static string? ReadMediaString(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private void OnMediaSessionsChanged(GlobalSystemMediaTransportControlsSessionManager sender, SessionsChangedEventArgs args)
    {
        _ = RefreshMediaSessionSnapshotAsync(CancellationToken.None);
    }

    private void OnCurrentMediaSessionChanged(GlobalSystemMediaTransportControlsSessionManager sender, CurrentSessionChangedEventArgs args)
    {
        _ = RefreshMediaSessionSnapshotAsync(CancellationToken.None);
    }

    private void OnMediaPropertiesChanged(GlobalSystemMediaTransportControlsSession sender, MediaPropertiesChangedEventArgs args)
    {
        _ = RefreshMediaSessionSnapshotAsync(CancellationToken.None);
    }

    private void OnMediaPlaybackInfoChanged(GlobalSystemMediaTransportControlsSession sender, PlaybackInfoChangedEventArgs args)
    {
        _ = RefreshMediaSessionSnapshotAsync(CancellationToken.None);
    }

    private void SetHealth(string status, string? reason)
    {
        CurrentHealth = new BridgeHealthModel
        {
            Status = status,
            Reason = reason,
            CheckedAt = DateTimeOffset.UtcNow.ToString("O"),
            BridgePath = null
        };

        BridgeHealthChanged?.Invoke(CurrentHealth);
        UpdateReadiness();
    }

    private void EmitConnectionState(string state, string activity, string? deviceId, string? detail)
    {
        ConnectionStateChanged?.Invoke(new ConnectionStateChangedPayload
        {
            State = state,
            Activity = activity,
            DeviceId = deviceId,
            Detail = detail,
            UpdatedAt = DateTimeOffset.UtcNow.ToString("O")
        });
    }

    private ConnectionActionResponsePayload CreateConnectionResponse(
        string state,
        string activity,
        string? deviceId,
        string? detail,
        bool emitEvent)
    {
        ConnectionActionResponsePayload payload = new()
        {
            State = state,
            Activity = activity,
            DeviceId = deviceId,
            Detail = detail,
            UpdatedAt = DateTimeOffset.UtcNow.ToString("O")
        };

        if (emitEvent)
        {
            ConnectionStateChanged?.Invoke(new ConnectionStateChangedPayload
            {
                State = payload.State,
                Activity = payload.Activity,
                DeviceId = payload.DeviceId,
                Detail = payload.Detail,
                UpdatedAt = payload.UpdatedAt
            });
        }

        return payload;
    }

    private DeviceSummaryModel MapDevice(DeviceInformation device)
    {
        return new DeviceSummaryModel
        {
            Id = device.Id,
            Name = string.IsNullOrWhiteSpace(device.Name) ? "Unnamed device" : device.Name,
            IsPaired = device.Pairing.IsPaired,
            CanConnect = device.IsEnabled,
            IsConnected = false,
            BatteryPercent = null,
            Manufacturer = null,
            ModelName = null,
            LastSeenAt = DateTimeOffset.UtcNow.ToString("O")
        };
    }

    private async Task TryEnrichDevicesAsync(long snapshotVersion, IReadOnlyList<DeviceSummaryModel> baseDevices, CancellationToken cancellationToken)
    {
        List<DeviceSummaryModel> enrichedDevices = [];
        bool anyChange = false;

        foreach (DeviceSummaryModel device in baseDevices)
        {
            DeviceSummaryModel enrichedDevice = await TryEnrichDeviceAsync(device, cancellationToken);
            enrichedDevices.Add(enrichedDevice);

            if (!anyChange && !AreSameDeviceShape(device, enrichedDevice))
            {
                anyChange = true;
            }
        }

        if (!anyChange)
        {
            return;
        }

        lock (_syncRoot)
        {
            if (_deviceSnapshotVersion != snapshotVersion)
            {
                return;
            }

            _deviceRegistry.Clear();
            foreach (DeviceSummaryModel device in enrichedDevices)
            {
                _deviceRegistry[device.Id] = device;
            }
        }

        DevicesUpdated?.Invoke(new DevicesUpdatedPayload { Devices = enrichedDevices });
    }

    private async Task<DeviceSummaryModel> TryEnrichDeviceAsync(DeviceSummaryModel device, CancellationToken cancellationToken)
    {
        try
        {
            DeviceInformation enrichedDevice = await DeviceInformation.CreateFromIdAsync(device.Id, RequestedDeviceProperties).AsTask(cancellationToken);
            bool isConnected = ReadBooleanProperty(enrichedDevice.Properties, "System.Devices.Aep.IsConnected");
            int? batteryPercent = ReadBatteryPercent(enrichedDevice.Properties, "System.Devices.Aep.Bluetooth.BatteryLevel");
            string? manufacturer = ReadStringProperty(enrichedDevice.Properties, "System.Devices.Aep.Manufacturer");
            string? modelName = ReadStringProperty(enrichedDevice.Properties, "System.Devices.Aep.ModelName");

            return new DeviceSummaryModel
            {
                Id = device.Id,
                Name = device.Name,
                IsPaired = device.IsPaired,
                CanConnect = device.CanConnect,
                IsConnected = isConnected,
                BatteryPercent = batteryPercent,
                Manufacturer = manufacturer,
                ModelName = modelName,
                LastSeenAt = device.LastSeenAt
            };
        }
        catch
        {
            // Optional metadata must never affect primary discovery reliability.
            return device;
        }
    }

    private static bool AreSameDeviceShape(DeviceSummaryModel left, DeviceSummaryModel right)
    {
        return left.Id == right.Id
            && left.Name == right.Name
            && left.IsPaired == right.IsPaired
            && left.CanConnect == right.CanConnect
            && left.IsConnected == right.IsConnected
            && left.BatteryPercent == right.BatteryPercent
            && left.Manufacturer == right.Manufacturer
            && left.ModelName == right.ModelName
            && left.LastSeenAt == right.LastSeenAt;
    }

    private static bool ReadBooleanProperty(IReadOnlyDictionary<string, object> properties, string propertyName)
    {
        if (!properties.TryGetValue(propertyName, out object? value) || value is null)
        {
            return false;
        }

        return value is bool booleanValue && booleanValue;
    }

    private static int? ReadBatteryPercent(IReadOnlyDictionary<string, object> properties, string propertyName)
    {
        if (!properties.TryGetValue(propertyName, out object? value) || value is null)
        {
            return null;
        }

        try
        {
            int numericValue = Convert.ToInt32(value);
            return numericValue is >= 0 and <= 100 ? numericValue : null;
        }
        catch
        {
            return null;
        }
    }

    private static string? ReadStringProperty(IReadOnlyDictionary<string, object> properties, string propertyName)
    {
        if (!properties.TryGetValue(propertyName, out object? value) || value is null)
        {
            return null;
        }

        string stringValue = value.ToString() ?? string.Empty;
        return string.IsNullOrWhiteSpace(stringValue) ? null : stringValue.Trim();
    }

    private void OnDeviceAdded(DeviceWatcher sender, DeviceInformation args)
    {
        _ = HandleWatcherChangeAsync("Eligible device added.", args.Id);
    }

    private void OnDeviceUpdated(DeviceWatcher sender, DeviceInformationUpdate args)
    {
        _ = HandleWatcherChangeAsync("Eligible device updated.", args.Id);
    }

    private void OnDeviceRemoved(DeviceWatcher sender, DeviceInformationUpdate args)
    {
        _ = HandleWatcherChangeAsync("Eligible device removed.", args.Id);
    }

    private void OnEnumerationCompleted(DeviceWatcher sender, object args)
    {
        _diagnostics.Info(
            "Eligible-device watcher enumeration completed.",
            sender.Status.ToString(),
            source: DiagnosticsSources.WindowsBridge,
            category: DiagnosticsCategories.TechnicalContext,
            summaryDetail: "Initial device watcher enumeration finished.");
        _ = RefreshDevicesAsync(CancellationToken.None);
    }

    private void OnWatcherStopped(DeviceWatcher sender, object args)
    {
        string detail = $"Device watcher stopped with status {sender.Status}.";
        _lastPlatformFailureDetail = detail;
        _diagnostics.Warning(
            "Eligible-device watcher stopped.",
            detail,
            source: DiagnosticsSources.WindowsBridge,
            category: DiagnosticsCategories.TechnicalContext,
            summaryDetail: "Windows stopped the eligible-device watcher unexpectedly.");
        SetHealth(BridgeHealthStatuses.Degraded, detail);
    }

    private void OnConnectionStateChanged(AudioPlaybackConnection sender, object args)
    {
        string? activeDeviceId;
        bool releaseInProgress;

        lock (_syncRoot)
        {
            activeDeviceId = _activeDeviceId;
            releaseInProgress = _releaseInProgress;
        }

        if (releaseInProgress)
        {
            return;
        }

        string publicState = sender.State == AudioPlaybackConnectionState.Opened
            ? ConnectionStates.Connected
            : ConnectionStates.Ready;
        string detail = sender.State == AudioPlaybackConnectionState.Opened
            ? "The native media-audio route is open."
            : "The native media-audio route is closed, but the connection remains ready to reopen.";

        _diagnostics.Info(
            "Native connection state changed.",
            $"AudioPlaybackConnection state changed to {sender.State}.",
            source: DiagnosticsSources.NativeAudio,
            category: DiagnosticsCategories.NativeDetail,
            summaryDetail: detail,
            advancedLabel: "Native connection state");

        if (sender.State != AudioPlaybackConnectionState.Opened)
        {
            _ = _visualizerMonitor.StopAsync();
            ClearCurrentMediaSession();
        }
        else
        {
            _ = RefreshMediaSessionSnapshotAsync(CancellationToken.None);
        }

        EmitConnectionState(publicState, ConnectionActivities.None, activeDeviceId, detail);
    }

    private async Task StartVisualizerMonitorAsync()
    {
        try
        {
            _visualizerMonitor.Start();
            await Task.CompletedTask;
        }
        catch (Exception exception)
        {
            _diagnostics.Warning(
                "Visualizer fell back to idle motion.",
                exception.Message,
                source: DiagnosticsSources.NativeAudio,
                category: DiagnosticsCategories.TechnicalContext,
                summaryDetail: "Live output analysis was unavailable, so the visualizer will remain decorative until monitoring succeeds.",
                advancedLabel: "Visualizer monitor failure");
        }
    }

    private async Task HandleWatcherChangeAsync(string title, string deviceId)
    {
        try
        {
            _diagnostics.Info(
                title,
                deviceId,
                source: DiagnosticsSources.WindowsBridge,
                category: DiagnosticsCategories.DeviceIdentifier,
                summaryDetail: "The eligible-device list changed.",
                advancedLabel: "Watcher device id");
            await RefreshDevicesAsync(CancellationToken.None);
        }
        catch (Exception exception)
        {
            _lastPlatformFailureDetail = exception.Message;
            _diagnostics.Error(
                "Eligible-device watcher refresh failed.",
                exception.Message,
                source: DiagnosticsSources.WindowsBridge,
                category: DiagnosticsCategories.CapabilityProbe,
                summaryDetail: "Windows could not refresh the eligible-device list.");
            SetHealth(BridgeHealthStatuses.Degraded, exception.Message);
        }
    }

    private void UpdateReadiness()
    {
        CurrentReadiness = BuildReadinessSnapshot();
        CapabilitiesUpdated?.Invoke(CurrentReadiness);
    }

    private CommunicationReadinessModel BuildReadinessSnapshot()
    {
        int eligibleDeviceCount;
        lock (_syncRoot)
        {
            eligibleDeviceCount = _deviceRegistry.Count;
        }

        string bridgeHealth = CurrentHealth.Status switch
        {
            BridgeHealthStatuses.Healthy => CapabilityBridgeHealthStates.Healthy,
            BridgeHealthStatuses.Unavailable => CapabilityBridgeHealthStates.Failed,
            _ => CapabilityBridgeHealthStates.Degraded
        };

        string mediaState = _platformProbeSucceeded ? CapabilityStates.Supported : CapabilityStates.Unknown;
        string mediaReason = _platformProbeSucceeded
            ? _lastMediaSessionFailureDetail is null
                ? "Windows AudioPlaybackConnection is available for media-audio routing. When Windows exposes the current phone media session, this bridge can surface track metadata and transport controls. Absolute volume is not exposed on this API path."
                : $"Windows AudioPlaybackConnection is available for media-audio routing, but current-session media access is unavailable right now: {_lastMediaSessionFailureDetail}. Absolute volume is not exposed on this API path."
            : _lastPlatformFailureDetail ?? "Media-audio readiness has not been fully validated yet.";

        string platformReadiness = _platformProbeSucceeded
            ? CapabilityEnvironmentStates.Ready
            : _lastPlatformFailureDetail is null
                ? CapabilityEnvironmentStates.Unknown
                : CapabilityEnvironmentStates.Blocked;

        string hardwareReadiness = _lastHardwareFailureDetail is not null
            ? CapabilityEnvironmentStates.Blocked
            : eligibleDeviceCount > 0
                ? CapabilityEnvironmentStates.Ready
                : _platformProbeSucceeded
                    ? CapabilityEnvironmentStates.Unknown
                    : CapabilityEnvironmentStates.Unknown;

        string confidence = _platformProbeSucceeded
            ? _lastHardwareFailureDetail is null
                ? CapabilityConfidences.High
                : CapabilityConfidences.Medium
            : CapabilityConfidences.Low;

        string readinessReason = _lastHardwareFailureDetail is not null
            ? "Media audio foundation is present, but the latest device open attempt was blocked by Windows or hardware."
            : eligibleDeviceCount > 0 && _platformProbeSucceeded
                ? "Media audio foundation is available and eligible devices are discoverable."
                : _platformProbeSucceeded
                    ? "Media audio foundation is available, but no eligible device is ready right now."
                    : "Media-audio capability probing is still incomplete or degraded.";

        string currentLimitation = "Call audio is not a shipped feature in Phase 2. Absolute volume is not exposed by AudioPlaybackConnection, and track metadata plus remote controls depend on Windows exposing the phone as the current media session, so availability remains device- and session-dependent on the current path.";
        string? readinessDetails = _lastHardwareFailureDetail ?? _lastPlatformFailureDetail;

        return new CommunicationReadinessModel
        {
            MediaAudio = new MediaCapabilityModel
            {
                State = mediaState,
                Reason = mediaReason
            },
            CallAudio = new CallCapabilityModel
            {
                State = CapabilityStates.Unsupported,
                Reason = "No validated HFP or communication-mode call-audio path is implemented in this product."
            },
            BridgeHealth = bridgeHealth,
            PlatformReadiness = platformReadiness,
            HardwareReadiness = hardwareReadiness,
            Confidence = confidence,
            ReadinessReason = readinessReason,
            CurrentLimitation = currentLimitation,
            ReadinessDetails = readinessDetails,
            CheckedAt = DateTimeOffset.UtcNow.ToString("O")
        };
    }
}
