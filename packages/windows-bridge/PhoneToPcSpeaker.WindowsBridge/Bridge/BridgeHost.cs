using System.Text.Json;
using PhoneToPcSpeaker.WindowsBridge.Bluetooth;
using PhoneToPcSpeaker.WindowsBridge.Diagnostics;
using PhoneToPcSpeaker.WindowsBridge.Models;

namespace PhoneToPcSpeaker.WindowsBridge.Bridge;

public sealed class BridgeHost : IAsyncDisposable
{
    private readonly BridgeDiagnostics _diagnostics;
    private readonly AudioPlaybackBridgeService _audioPlaybackBridgeService;

    public BridgeHost()
    {
        _diagnostics = new BridgeDiagnostics();
        _audioPlaybackBridgeService = new AudioPlaybackBridgeService(_diagnostics);

        _diagnostics.Appended += OnDiagnosticAppended;
        _audioPlaybackBridgeService.BridgeHealthChanged += (payload) =>
            _ = EmitEventSafeAsync(BridgeMessageTypes.BridgeHealthChanged, payload);
        _audioPlaybackBridgeService.CapabilitiesUpdated += (payload) =>
            _ = EmitEventSafeAsync(BridgeMessageTypes.CapabilitiesUpdated, payload);
        _audioPlaybackBridgeService.DevicesUpdated += (payload) =>
            _ = EmitEventSafeAsync(BridgeMessageTypes.DevicesUpdated, payload);
        _audioPlaybackBridgeService.ConnectionStateChanged += (payload) =>
            _ = EmitEventSafeAsync(BridgeMessageTypes.ConnectionStateChanged, payload);
        _audioPlaybackBridgeService.VisualizerSignalUpdated += (payload) =>
            _ = EmitEventSafeAsync(BridgeMessageTypes.VisualizerSignalUpdated, payload);
        _audioPlaybackBridgeService.MediaSessionUpdated += (payload) =>
            _ = EmitEventSafeAsync(BridgeMessageTypes.MediaSessionUpdated, payload);
    }

    public async Task<int> RunAsync(CancellationToken cancellationToken)
    {
        _diagnostics.Info("Windows bridge process started.", null);
        await _audioPlaybackBridgeService.InitializeAsync(cancellationToken);

        while (!cancellationToken.IsCancellationRequested)
        {
            string? line = await Console.In.ReadLineAsync();
            if (line is null)
            {
                break;
            }

            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            await ProcessInputLineAsync(line, cancellationToken);
        }

        _diagnostics.Info("Bridge stdin closed. Shutting down.", null);
        await DisposeAsync();
        return 0;
    }

    public async ValueTask DisposeAsync()
    {
        _diagnostics.Appended -= OnDiagnosticAppended;
        await _audioPlaybackBridgeService.DisposeAsync();
    }

    private void OnDiagnosticAppended(DiagnosticsEventModel payload)
    {
        _ = EmitEventSafeAsync(BridgeMessageTypes.DiagnosticsAppended, payload);
    }

    private async Task ProcessInputLineAsync(string line, CancellationToken cancellationToken)
    {
        BridgeRequestEnvelope? request;

        try
        {
            request = JsonSerializer.Deserialize<BridgeRequestEnvelope>(line, BridgeJson.SerializerOptions);
        }
        catch (JsonException jsonException)
        {
            _diagnostics.Error("Failed to parse bridge request JSON.", jsonException.Message);
            return;
        }

        if (request is null || string.IsNullOrWhiteSpace(request.Id) || string.IsNullOrWhiteSpace(request.Type))
        {
            _diagnostics.Error("Bridge request was missing id or type.", line);
            return;
        }

        object responseEnvelope;

        try
        {
            responseEnvelope = request.Type switch
            {
                BridgeMessageTypes.BridgePing => BuildSuccessResponse(
                    request.Id,
                    new BridgePingResponsePayload { Health = _audioPlaybackBridgeService.CurrentHealth }),

                BridgeMessageTypes.DevicesRefresh => BuildSuccessResponse(
                    request.Id,
                    new DevicesRefreshResponsePayload
                    {
                        Devices = (await _audioPlaybackBridgeService.RefreshDevicesAsync(cancellationToken)).ToList()
                    }),

                BridgeMessageTypes.ConnectionEnable => BuildSuccessResponse(
                    request.Id,
                    await _audioPlaybackBridgeService.EnableConnectionAsync(
                        DeserializePayload<ConnectionCommandPayload>(request.Payload).DeviceId,
                        cancellationToken)),

                BridgeMessageTypes.ConnectionOpen => BuildSuccessResponse(
                    request.Id,
                    await _audioPlaybackBridgeService.OpenConnectionAsync(
                        DeserializePayload<ConnectionCommandPayload>(request.Payload).DeviceId,
                        cancellationToken)),

                BridgeMessageTypes.ConnectionRelease => BuildSuccessResponse(
                    request.Id,
                    await _audioPlaybackBridgeService.ReleaseConnectionAsync(
                        DeserializePayload<ConnectionReleasePayload>(request.Payload).DeviceId)),

                BridgeMessageTypes.DiagnosticsGetRecent => BuildSuccessResponse(
                    request.Id,
                    new DiagnosticsGetRecentResponsePayload
                    {
                        Diagnostics = _diagnostics.GetRecent(DeserializePayload<DiagnosticsGetRecentPayload>(request.Payload).Limit)
                    }),

                BridgeMessageTypes.CapabilitiesGetCurrent => BuildSuccessResponse(
                    request.Id,
                    new CapabilitiesGetCurrentResponsePayload
                    {
                        Readiness = _audioPlaybackBridgeService.CurrentReadiness
                    }),

                BridgeMessageTypes.MediaSessionGetCurrent => BuildSuccessResponse(
                    request.Id,
                    new MediaRemoteSessionGetCurrentResponsePayload
                    {
                        Session = _audioPlaybackBridgeService.CurrentMediaSession
                    }),

                BridgeMessageTypes.MediaSessionSendCommand => BuildSuccessResponse(
                    request.Id,
                    await _audioPlaybackBridgeService.SendMediaRemoteCommandAsync(
                        DeserializePayload<MediaRemoteTransportCommandPayload>(request.Payload).Command,
                        cancellationToken)),

                _ => BuildErrorResponse(
                    request.Id,
                    CreateUserFacingError(
                        UserFacingErrorCodes.BridgeRequestFailed,
                        $"Unsupported bridge request type: {request.Type}",
                        true,
                        "Use matching desktop and bridge builds."))
            };
        }
        catch (Exception exception)
        {
            responseEnvelope = await BuildFailureResponseAsync(request, exception);
        }

        await EmitStdoutJsonAsync(responseEnvelope);
    }

    private async Task<object> BuildFailureResponseAsync(BridgeRequestEnvelope request, Exception exception)
    {
        _diagnostics.Error($"Bridge request failed: {request.Type}", exception.Message);

        if (request.Type is BridgeMessageTypes.ConnectionEnable or BridgeMessageTypes.ConnectionOpen or BridgeMessageTypes.ConnectionRelease)
        {
            await EmitEventSafeAsync(
                BridgeMessageTypes.ConnectionStateChanged,
                new ConnectionStateChangedPayload
                {
                    State = ConnectionStates.Failed,
                    Activity = ConnectionActivities.None,
                    DeviceId = ExtractDeviceId(request),
                    Detail = exception.Message,
                    UpdatedAt = DateTimeOffset.UtcNow.ToString("O")
                });
        }

        UserFacingErrorModel error = request.Type switch
        {
            BridgeMessageTypes.ConnectionEnable => CreateUserFacingError(
                UserFacingErrorCodes.ConnectionEnableFailed,
                exception.Message,
                true,
                "Check the selected device, Windows Bluetooth support, and recent diagnostics."),

            BridgeMessageTypes.ConnectionOpen => CreateUserFacingError(
                UserFacingErrorCodes.ConnectionOpenFailed,
                exception.Message,
                true,
                "Confirm the device is enabled and retry opening the connection."),

            BridgeMessageTypes.ConnectionRelease => CreateUserFacingError(
                UserFacingErrorCodes.ConnectionReleaseFailed,
                exception.Message,
                true,
                "Retry releasing the connection after reviewing diagnostics."),

            BridgeMessageTypes.CapabilitiesGetCurrent => CreateUserFacingError(
                UserFacingErrorCodes.CapabilityProbeInconclusive,
                exception.Message,
                true,
                "Review the readiness diagnostics and retry the capability probe."),

            BridgeMessageTypes.MediaSessionSendCommand => CreateUserFacingError(
                UserFacingErrorCodes.BridgeRequestFailed,
                exception.Message,
                true,
                "Start playback on the phone and retry. If another player is active on Windows, media keys may follow that session instead."),

            _ => CreateUserFacingError(
                UserFacingErrorCodes.BridgeRequestFailed,
                exception.Message,
                true,
                "Review the latest diagnostics and retry the request.")
        };

        return BuildErrorResponse(request.Id, error);
    }

    private static T DeserializePayload<T>(JsonElement payload) where T : new()
    {
        if (payload.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return new T();
        }

        T? deserializedPayload = payload.Deserialize<T>(BridgeJson.SerializerOptions);
        return deserializedPayload ?? new T();
    }

    private static string? ExtractDeviceId(BridgeRequestEnvelope request)
    {
        try
        {
            return request.Type switch
            {
                BridgeMessageTypes.ConnectionEnable or BridgeMessageTypes.ConnectionOpen =>
                    DeserializePayload<ConnectionCommandPayload>(request.Payload).DeviceId,
                BridgeMessageTypes.ConnectionRelease =>
                    DeserializePayload<ConnectionReleasePayload>(request.Payload).DeviceId,
                _ => null
            };
        }
        catch
        {
            return null;
        }
    }

    private static BridgeResponseEnvelope<TPayload> BuildSuccessResponse<TPayload>(string requestId, TPayload payload)
    {
        return new BridgeResponseEnvelope<TPayload>
        {
            RequestId = requestId,
            Ok = true,
            Payload = payload
        };
    }

    private static BridgeResponseEnvelope<object> BuildErrorResponse(string requestId, UserFacingErrorModel error)
    {
        return new BridgeResponseEnvelope<object>
        {
            RequestId = requestId,
            Ok = false,
            Error = error
        };
    }

    private static UserFacingErrorModel CreateUserFacingError(
        string code,
        string message,
        bool recoverable,
        string? suggestedAction)
    {
        return new UserFacingErrorModel
        {
            Code = code,
            Message = message,
            Recoverable = recoverable,
            SuggestedAction = suggestedAction
        };
    }

    private async Task EmitEventSafeAsync<TPayload>(string type, TPayload payload)
    {
        try
        {
            await EmitStdoutJsonAsync(new BridgeEventEnvelope<TPayload>
            {
                Type = type,
                Payload = payload
            });
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"Bridge event emission failed: {exception.Message}");
        }
    }

    private static async Task EmitStdoutJsonAsync<TPayload>(TPayload payload)
    {
        string json = JsonSerializer.Serialize(payload, BridgeJson.SerializerOptions);
        await Console.Out.WriteLineAsync(json);
        await Console.Out.FlushAsync();
    }
}
