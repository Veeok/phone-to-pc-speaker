using System.Buffers;
using System.Buffers.Binary;
using System.Runtime.InteropServices;
using PhoneToPcSpeaker.WindowsBridge.Diagnostics;
using PhoneToPcSpeaker.WindowsBridge.Models;

namespace PhoneToPcSpeaker.WindowsBridge.Audio;

public sealed class LoopbackSpectrumMonitor : IAsyncDisposable
{
    private static readonly ERole[] CandidateRoles = [ERole.Console, ERole.Multimedia, ERole.Communications];
    private static readonly SpectrumRangeDefinition[] DirectBandDefinitions =
    [
        new(20d, 250d, 2.1d, 0.72d, 0.08d),
        new(250d, 500d, 1.72d, 0.78d, 0.12d),
        new(500d, 2000d, 1.86d, 0.8d, 0.18d),
        new(2000d, 6000d, 2.02d, 0.82d, 0.22d),
        new(6000d, 12000d, 2.18d, 0.86d, 0.18d),
        new(12000d, 20000d, 2.46d, 0.92d, 0.3d)
    ];
    private const int FftLength = 2048;
    private const int OverlapCount = FftLength / 2;
    private const int PublishIntervalMilliseconds = 50;
    private static readonly TimeSpan SilenceTimeout = TimeSpan.FromMilliseconds(260);
    private static readonly float[] Window = BuildHannWindow(FftLength);
    private static readonly Guid PcmSubFormat = new("00000001-0000-0010-8000-00AA00389B71");
    private static readonly Guid FloatSubFormat = new("00000003-0000-0010-8000-00AA00389B71");

    private readonly object _syncRoot = new();
    private readonly BridgeDiagnostics _diagnostics;
    private readonly float[] _sampleWindow = new float[FftLength];
    private readonly double[] _fftReal = new double[FftLength];
    private readonly double[] _fftImaginary = new double[FftLength];
    private readonly float[] _targetDirectBands = new float[DirectBandDefinitions.Length];
    private readonly float[] _directBandState = new float[DirectBandDefinitions.Length];
    private readonly float[] _previousDirectBandTargets = new float[DirectBandDefinitions.Length];

    private CancellationTokenSource? _monitorCancellation;
    private Task? _captureTask;
    private Task? _publisherTask;
    private int _sampleWindowCount;
    private float _targetLow;
    private float _targetMid;
    private float _targetHigh;
    private float _targetTransient;
    private float _targetEnergy;
    private float _lowState;
    private float _midState;
    private float _highState;
    private float _transientState;
    private float _energyState;
    private DateTimeOffset _lastSampleAt = DateTimeOffset.MinValue;
    private DateTimeOffset _startedAt = DateTimeOffset.MinValue;
    private string? _captureDescription;
    private bool _hasReportedWaitingForSignal;
    private bool _hasReportedActiveSignal;
    private bool _hasLockedSignalSource;
    private long _packetCount;
    private long _silentPacketCount;
    private long _capturedFrameCount;

    public LoopbackSpectrumMonitor(BridgeDiagnostics diagnostics)
    {
        _diagnostics = diagnostics;
    }

    public event Action<AudioVisualizerSignalModel>? SignalUpdated;

    public void Start()
    {
        lock (_syncRoot)
        {
            if (_monitorCancellation is not null)
            {
                return;
            }

            ResetState();
            _monitorCancellation = new CancellationTokenSource();
            _captureTask = Task.Run(() => CaptureLoopAsync(_monitorCancellation.Token));
            _publisherTask = Task.Run(() => PublishLoopAsync(_monitorCancellation.Token));
        }
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync();
    }

    public async Task StopAsync()
    {
        CancellationTokenSource? monitorCancellation;
        Task? captureTask;
        Task? publisherTask;

        lock (_syncRoot)
        {
            monitorCancellation = _monitorCancellation;
            captureTask = _captureTask;
            publisherTask = _publisherTask;
            _monitorCancellation = null;
            _captureTask = null;
            _publisherTask = null;
            ResetState();
        }

        if (monitorCancellation is not null)
        {
            monitorCancellation.Cancel();
        }

        if (captureTask is not null)
        {
            try
            {
                await captureTask;
            }
            catch (OperationCanceledException)
            {
            }
        }

        if (publisherTask is not null)
        {
            try
            {
                await publisherTask;
            }
            catch (OperationCanceledException)
            {
            }
        }

        monitorCancellation?.Dispose();
        SignalUpdated?.Invoke(CreateSignalSnapshot(false));
    }

    private async Task CaptureLoopAsync(CancellationToken cancellationToken)
    {
        int roleIndex = 0;

        while (!cancellationToken.IsCancellationRequested)
        {
            ERole role = CandidateRoles[roleIndex % CandidateRoles.Length];
            bool shouldTryNextRole = await CaptureRoleAsync(role, cancellationToken);
            if (!shouldTryNextRole)
            {
                return;
            }

            roleIndex += 1;
        }
    }

    private async Task<bool> CaptureRoleAsync(ERole role, CancellationToken cancellationToken)
    {
        IMMDeviceEnumerator? deviceEnumerator = null;
        IMMDevice? device = null;
        IAudioClient? audioClient = null;
        IAudioCaptureClient? captureClient = null;
        IntPtr mixFormatPointer = IntPtr.Zero;

        try
        {
            deviceEnumerator = (IMMDeviceEnumerator)(object)new MMDeviceEnumeratorComObject();
            Marshal.ThrowExceptionForHR(deviceEnumerator.GetDefaultAudioEndpoint(EDataFlow.Render, role, out device));
            audioClient = ActivateInterface<IAudioClient>(device);
            Marshal.ThrowExceptionForHR(audioClient.GetMixFormat(out mixFormatPointer));

            WaveFormatInfo waveFormat = ParseWaveFormat(mixFormatPointer);
            string endpointId = TryGetDeviceId(device);
            Guid sessionGuid = Guid.Empty;
            Marshal.ThrowExceptionForHR(audioClient.Initialize(AudioClientShareMode.Shared, AudioClientStreamFlags.Loopback, 0, 0, mixFormatPointer, ref sessionGuid));
            captureClient = GetService<IAudioCaptureClient>(audioClient);
            Marshal.ThrowExceptionForHR(audioClient.Start());

            lock (_syncRoot)
            {
                _packetCount = 0;
                _silentPacketCount = 0;
                _capturedFrameCount = 0;
                _startedAt = DateTimeOffset.UtcNow;
                _captureDescription = $"Role {role}, {waveFormat.SampleRate} Hz, {waveFormat.BitsPerSample}-bit {waveFormat.Encoding}, {waveFormat.Channels} ch, endpoint {endpointId}";
                _hasReportedWaitingForSignal = false;
            }

            _diagnostics.Info(
                "Visualizer frequency analysis is active.",
                $"WASAPI loopback capture analyzes the current Windows output mix and produces low, mid, high, transient, and overall energy data for the renderer. Format: {_captureDescription}. If other PC audio plays on the same output device, the visualizer will react to that mix too.",
                source: DiagnosticsSources.NativeAudio,
                category: DiagnosticsCategories.TechnicalContext,
                summaryDetail: "The visualizer now reacts to low, mid, and high frequency content on the current Windows output mix.",
                advancedLabel: "Visualizer analysis path");

            while (!cancellationToken.IsCancellationRequested)
            {
                ReadAvailablePackets(captureClient, waveFormat);

                if (ShouldTryNextRole(role, out string? fallbackDetail))
                {
                    _diagnostics.Warning(
                        "Visualizer is trying another Windows output role.",
                        fallbackDetail,
                        source: DiagnosticsSources.NativeAudio,
                        category: DiagnosticsCategories.TechnicalContext,
                        summaryDetail: "The current loopback role did not expose usable audio yet, so the visualizer is probing another output role.",
                        advancedLabel: "Visualizer role fallback");
                    return true;
                }

                await Task.Delay(10, cancellationToken);
            }

            return false;
        }
        catch (OperationCanceledException)
        {
            return false;
        }
        catch (Exception exception)
        {
            _diagnostics.Warning(
                "Visualizer fell back to idle motion.",
                exception.Message,
                source: DiagnosticsSources.NativeAudio,
                category: DiagnosticsCategories.TechnicalContext,
                summaryDetail: "Loopback capture was unavailable, so the visualizer will remain mostly idle until monitoring recovers.",
                advancedLabel: "Visualizer capture failure");
            return true;
        }
        finally
        {
            try
            {
                audioClient?.Stop();
            }
            catch
            {
            }

            if (mixFormatPointer != IntPtr.Zero)
            {
                Marshal.FreeCoTaskMem(mixFormatPointer);
            }

            ReleaseComObject(captureClient);
            ReleaseComObject(audioClient);
            ReleaseComObject(device);
            ReleaseComObject(deviceEnumerator);
        }
    }

    private async Task PublishLoopAsync(CancellationToken cancellationToken)
    {
        using PeriodicTimer timer = new(TimeSpan.FromMilliseconds(PublishIntervalMilliseconds));

        while (await timer.WaitForNextTickAsync(cancellationToken))
        {
            SignalUpdated?.Invoke(BuildPublishedSignal());
        }
    }

    private void ReadAvailablePackets(IAudioCaptureClient captureClient, WaveFormatInfo waveFormat)
    {
        while (true)
        {
            Marshal.ThrowExceptionForHR(captureClient.GetNextPacketSize(out uint packetLength));
            if (packetLength == 0)
            {
                return;
            }

            Marshal.ThrowExceptionForHR(captureClient.GetBuffer(
                out IntPtr dataPointer,
                out uint frameCount,
                out AudioClientBufferFlags flags,
                out _,
                out _));

            try
            {
                ProcessCapturedFrames(dataPointer, (int)frameCount, flags, waveFormat);
            }
            finally
            {
                Marshal.ThrowExceptionForHR(captureClient.ReleaseBuffer(frameCount));
            }
        }
    }

    private void ProcessCapturedFrames(IntPtr dataPointer, int frameCount, AudioClientBufferFlags flags, WaveFormatInfo waveFormat)
    {
        if (frameCount <= 0)
        {
            return;
        }

        lock (_syncRoot)
        {
            _packetCount += 1;
            _capturedFrameCount += frameCount;
            if ((flags & AudioClientBufferFlags.Silent) != 0 || dataPointer == IntPtr.Zero)
            {
                _silentPacketCount += 1;
            }
        }

        float[] monoBuffer = ArrayPool<float>.Shared.Rent(frameCount);

        try
        {
            if ((flags & AudioClientBufferFlags.Silent) != 0 || dataPointer == IntPtr.Zero)
            {
                Array.Clear(monoBuffer, 0, frameCount);
                ProcessSamples(monoBuffer, frameCount, waveFormat.SampleRate);
                return;
            }

            int byteCount = frameCount * waveFormat.BlockAlign;
            byte[] sourceBytes = ArrayPool<byte>.Shared.Rent(byteCount);

            try
            {
                Marshal.Copy(dataPointer, sourceBytes, 0, byteCount);
                DecodeToMono(sourceBytes, byteCount, waveFormat, monoBuffer, frameCount);
                ProcessSamples(monoBuffer, frameCount, waveFormat.SampleRate);
            }
            finally
            {
                ArrayPool<byte>.Shared.Return(sourceBytes);
            }
        }
        finally
        {
            ArrayPool<float>.Shared.Return(monoBuffer);
        }
    }

    private static void DecodeToMono(byte[] sourceBytes, int byteCount, WaveFormatInfo waveFormat, float[] monoBuffer, int frameCount)
    {
        int bytesPerSample = waveFormat.BlockAlign / waveFormat.Channels;

        switch (waveFormat.Encoding)
        {
            case SampleEncoding.Float when waveFormat.BitsPerSample == 32:
            {
                int sampleCount = byteCount / sizeof(float);
                float[] interleavedBuffer = ArrayPool<float>.Shared.Rent(sampleCount);

                try
                {
                    Buffer.BlockCopy(sourceBytes, 0, interleavedBuffer, 0, byteCount);

                    for (int frameIndex = 0; frameIndex < frameCount; frameIndex += 1)
                    {
                        double monoSample = 0d;
                        int baseIndex = frameIndex * waveFormat.Channels;

                        for (int channelIndex = 0; channelIndex < waveFormat.Channels; channelIndex += 1)
                        {
                            monoSample += interleavedBuffer[baseIndex + channelIndex];
                        }

                        monoBuffer[frameIndex] = (float)(monoSample / waveFormat.Channels);
                    }
                }
                finally
                {
                    ArrayPool<float>.Shared.Return(interleavedBuffer);
                }

                return;
            }

            case SampleEncoding.Float when waveFormat.BitsPerSample == 64:
                for (int frameIndex = 0; frameIndex < frameCount; frameIndex += 1)
                {
                    double monoSample = 0d;
                    int frameOffset = frameIndex * waveFormat.BlockAlign;

                    for (int channelIndex = 0; channelIndex < waveFormat.Channels; channelIndex += 1)
                    {
                        monoSample += BitConverter.ToDouble(sourceBytes, frameOffset + (channelIndex * bytesPerSample));
                    }

                    monoBuffer[frameIndex] = (float)(monoSample / waveFormat.Channels);
                }

                return;

            case SampleEncoding.Pcm when waveFormat.BitsPerSample == 16:
                for (int frameIndex = 0; frameIndex < frameCount; frameIndex += 1)
                {
                    double monoSample = 0d;
                    int frameOffset = frameIndex * waveFormat.BlockAlign;

                    for (int channelIndex = 0; channelIndex < waveFormat.Channels; channelIndex += 1)
                    {
                        int sampleOffset = frameOffset + (channelIndex * bytesPerSample);
                        short value = BinaryPrimitives.ReadInt16LittleEndian(sourceBytes.AsSpan(sampleOffset, bytesPerSample));
                        monoSample += value / 32768f;
                    }

                    monoBuffer[frameIndex] = (float)(monoSample / waveFormat.Channels);
                }

                return;

            case SampleEncoding.Pcm when waveFormat.BitsPerSample == 24:
                for (int frameIndex = 0; frameIndex < frameCount; frameIndex += 1)
                {
                    double monoSample = 0d;
                    int frameOffset = frameIndex * waveFormat.BlockAlign;

                    for (int channelIndex = 0; channelIndex < waveFormat.Channels; channelIndex += 1)
                    {
                        int sampleOffset = frameOffset + (channelIndex * bytesPerSample);
                        int sample = sourceBytes[sampleOffset]
                            | (sourceBytes[sampleOffset + 1] << 8)
                            | (sourceBytes[sampleOffset + 2] << 16);

                        if ((sample & 0x00800000) != 0)
                        {
                            sample |= unchecked((int)0xFF000000);
                        }

                        monoSample += sample / 8388608f;
                    }

                    monoBuffer[frameIndex] = (float)(monoSample / waveFormat.Channels);
                }

                return;

            case SampleEncoding.Pcm when waveFormat.BitsPerSample == 32:
                for (int frameIndex = 0; frameIndex < frameCount; frameIndex += 1)
                {
                    double monoSample = 0d;
                    int frameOffset = frameIndex * waveFormat.BlockAlign;

                    for (int channelIndex = 0; channelIndex < waveFormat.Channels; channelIndex += 1)
                    {
                        int sampleOffset = frameOffset + (channelIndex * bytesPerSample);
                        int value = BinaryPrimitives.ReadInt32LittleEndian(sourceBytes.AsSpan(sampleOffset, bytesPerSample));
                        monoSample += value / 2147483648f;
                    }

                    monoBuffer[frameIndex] = (float)(monoSample / waveFormat.Channels);
                }

                return;

            default:
                throw new NotSupportedException($"Unsupported loopback capture format: {waveFormat.Encoding} {waveFormat.BitsPerSample}-bit.");
        }
    }

    private void ProcessSamples(float[] monoBuffer, int sampleCount, int sampleRate)
    {
        lock (_syncRoot)
        {
            _lastSampleAt = DateTimeOffset.UtcNow;

            for (int sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1)
            {
                _sampleWindow[_sampleWindowCount] = monoBuffer[sampleIndex];
                _sampleWindowCount += 1;

                if (_sampleWindowCount < FftLength)
                {
                    continue;
                }

                AnalyzeCurrentWindow(sampleRate);
                Array.Copy(_sampleWindow, OverlapCount, _sampleWindow, 0, OverlapCount);
                _sampleWindowCount = OverlapCount;
            }
        }
    }

    private void AnalyzeCurrentWindow(int sampleRate)
    {
        double rmsSum = 0d;

        for (int index = 0; index < FftLength; index += 1)
        {
            double windowedSample = _sampleWindow[index] * Window[index];
            rmsSum += _sampleWindow[index] * _sampleWindow[index];
            _fftReal[index] = windowedSample;
            _fftImaginary[index] = 0d;
        }

        PerformFft(_fftReal, _fftImaginary);

        float energy = NormalizeEnergy(Math.Sqrt(rmsSum / FftLength));
        if (energy <= 0.003f)
        {
            Array.Clear(_targetDirectBands);
            _targetLow = 0f;
            _targetMid = 0f;
            _targetHigh = 0f;
            _targetTransient = 0f;
            _targetEnergy = 0f;
            DecayPreviousDirectBandTargets();
            return;
        }

        Span<double> directBandAverages = stackalloc double[DirectBandDefinitions.Length];
        double totalAverage = 0d;

        for (int index = 0; index < DirectBandDefinitions.Length; index += 1)
        {
            double average = MeasureWeightedRange(sampleRate, DirectBandDefinitions[index]);
            directBandAverages[index] = average;
            totalAverage += average;
        }

        if (totalAverage <= double.Epsilon)
        {
            Array.Clear(_targetDirectBands);
            _targetLow = 0f;
            _targetMid = 0f;
            _targetHigh = 0f;
            _targetTransient = 0f;
            _targetEnergy = energy;
            return;
        }

        for (int index = 0; index < DirectBandDefinitions.Length; index += 1)
        {
            _targetDirectBands[index] = NormalizeDirectBand(directBandAverages[index], totalAverage, energy, DirectBandDefinitions[index]);
        }

        _targetLow = Math.Clamp((_targetDirectBands[(int)DirectBandIndex.Bass] * 0.78f) + (_targetDirectBands[(int)DirectBandIndex.LowMids] * 0.34f), 0f, 1f);
        _targetMid = Math.Clamp(
            (_targetDirectBands[(int)DirectBandIndex.LowMids] * 0.16f)
            + (_targetDirectBands[(int)DirectBandIndex.Mids] * 0.74f)
            + (_targetDirectBands[(int)DirectBandIndex.Presence] * 0.34f),
            0f,
            1f);
        _targetHigh = Math.Clamp(
            (_targetDirectBands[(int)DirectBandIndex.Presence] * 0.22f)
            + (_targetDirectBands[(int)DirectBandIndex.Treble] * 0.74f)
            + (_targetDirectBands[(int)DirectBandIndex.Air] * 0.42f),
            0f,
            1f);

        float transientTarget = ComputeTransient(energy);

        _targetTransient = transientTarget;
        _targetEnergy = energy;
        Array.Copy(_targetDirectBands, _previousDirectBandTargets, DirectBandDefinitions.Length);
    }

    private float ComputeTransient(float energy)
    {
        float bassAttack = Math.Max(0f, _targetDirectBands[(int)DirectBandIndex.Bass] - _previousDirectBandTargets[(int)DirectBandIndex.Bass]);
        float lowMidAttack = Math.Max(0f, _targetDirectBands[(int)DirectBandIndex.LowMids] - _previousDirectBandTargets[(int)DirectBandIndex.LowMids]);
        float midsAttack = Math.Max(0f, _targetDirectBands[(int)DirectBandIndex.Mids] - _previousDirectBandTargets[(int)DirectBandIndex.Mids]);
        float presenceAttack = Math.Max(0f, _targetDirectBands[(int)DirectBandIndex.Presence] - _previousDirectBandTargets[(int)DirectBandIndex.Presence]);
        float trebleAttack = Math.Max(0f, _targetDirectBands[(int)DirectBandIndex.Treble] - _previousDirectBandTargets[(int)DirectBandIndex.Treble]);
        float airAttack = Math.Max(0f, _targetDirectBands[(int)DirectBandIndex.Air] - _previousDirectBandTargets[(int)DirectBandIndex.Air]);
        float spectralFlux =
            (bassAttack * 0.24f)
            + (lowMidAttack * 0.16f)
            + (midsAttack * 0.26f)
            + (presenceAttack * 0.44f)
            + (trebleAttack * 0.52f)
            + (airAttack * 0.28f);

        return Math.Clamp((spectralFlux * 1.86f) + (energy * 0.14f), 0f, 1f);
    }

    private AudioVisualizerSignalModel BuildPublishedSignal()
    {
        lock (_syncRoot)
        {
            DateTimeOffset now = DateTimeOffset.UtcNow;

            if (_lastSampleAt != DateTimeOffset.MinValue && DateTimeOffset.UtcNow - _lastSampleAt > SilenceTimeout)
            {
                Array.Clear(_targetDirectBands);
                _targetLow = 0f;
                _targetMid = 0f;
                _targetHigh = 0f;
                _targetTransient = 0f;
                _targetEnergy = 0f;
            }

            SmoothDirectBand(DirectBandIndex.Bass, 0.16f, 0.07f);
            SmoothDirectBand(DirectBandIndex.LowMids, 0.18f, 0.08f);
            SmoothDirectBand(DirectBandIndex.Mids, 0.2f, 0.085f);
            SmoothDirectBand(DirectBandIndex.Presence, 0.22f, 0.095f);
            SmoothDirectBand(DirectBandIndex.Treble, 0.24f, 0.1f);
            SmoothDirectBand(DirectBandIndex.Air, 0.26f, 0.11f);
            _lowState += (_targetLow - _lowState) * (_targetLow >= _lowState ? 0.24f : 0.1f);
            _midState += (_targetMid - _midState) * (_targetMid >= _midState ? 0.24f : 0.11f);
            _highState += (_targetHigh - _highState) * (_targetHigh >= _highState ? 0.26f : 0.12f);
            _energyState += (_targetEnergy - _energyState) * (_targetEnergy >= _energyState ? 0.22f : 0.1f);
            _transientState += (_targetTransient - _transientState) * (_targetTransient >= _transientState ? 0.42f : 0.18f);

            if (!_hasReportedWaitingForSignal && _startedAt != DateTimeOffset.MinValue && now - _startedAt > TimeSpan.FromSeconds(3) && _energyState < 0.02f)
            {
                _hasReportedWaitingForSignal = true;
                string detail = _captureDescription is null
                    ? $"Packets: {_packetCount}, silent packets: {_silentPacketCount}, frames: {_capturedFrameCount}."
                    : $"{_captureDescription}. Packets: {_packetCount}, silent packets: {_silentPacketCount}, frames: {_capturedFrameCount}.";

                _diagnostics.Warning(
                    "Visualizer loopback capture is not seeing usable audio yet.",
                    detail,
                    source: DiagnosticsSources.NativeAudio,
                    category: DiagnosticsCategories.TechnicalContext,
                    summaryDetail: "Bluetooth playback is connected, but the frequency analyzer has not observed usable output samples yet.",
                    advancedLabel: "Visualizer capture counters");
            }

            if (!_hasReportedActiveSignal && _energyState >= 0.035f)
            {
                _hasReportedActiveSignal = true;
                _hasLockedSignalSource = true;
                _diagnostics.Info(
                    "Visualizer loopback capture is receiving usable audio.",
                    $"Low {_lowState:0.00}, Mid {_midState:0.00}, High {_highState:0.00}, Bass {_directBandState[(int)DirectBandIndex.Bass]:0.00}, Presence {_directBandState[(int)DirectBandIndex.Presence]:0.00}, Treble {_directBandState[(int)DirectBandIndex.Treble]:0.00}, Transient {_transientState:0.00}, Energy {_energyState:0.00}.",
                    source: DiagnosticsSources.NativeAudio,
                    category: DiagnosticsCategories.TechnicalContext,
                    summaryDetail: "The frequency analyzer is receiving output samples and driving the visualizer.",
                    advancedLabel: "Visualizer live bands");
            }

            return CreateSignalSnapshot(_energyState > 0.018f);
        }
    }

    private AudioVisualizerSignalModel CreateSignalSnapshot(bool isActive)
    {
        float bass = Math.Clamp(_directBandState[(int)DirectBandIndex.Bass], 0f, 1f);
        float lowMids = Math.Clamp(_directBandState[(int)DirectBandIndex.LowMids], 0f, 1f);
        float mids = Math.Clamp(_directBandState[(int)DirectBandIndex.Mids], 0f, 1f);
        float presence = Math.Clamp(_directBandState[(int)DirectBandIndex.Presence], 0f, 1f);
        float treble = Math.Clamp(_directBandState[(int)DirectBandIndex.Treble], 0f, 1f);
        float air = Math.Clamp(_directBandState[(int)DirectBandIndex.Air], 0f, 1f);

        return new AudioVisualizerSignalModel
        {
            Low = Math.Clamp(_lowState, 0f, 1f),
            Mid = Math.Clamp(_midState, 0f, 1f),
            High = Math.Clamp(_highState, 0f, 1f),
            Bass = bass,
            LowMids = lowMids,
            Mids = mids,
            Presence = presence,
            Treble = treble,
            Air = air,
            VocalPresence = ComputeVocalPresence(mids, presence, treble, _energyState),
            InstrumentPresence = ComputeInstrumentPresence(lowMids, mids, presence, treble, air, _energyState),
            Warmth = ComputeWarmth(bass, lowMids),
            Clarity = ComputeClarity(presence, treble, air),
            Brightness = ComputeBrightness(treble, air),
            Punch = ComputePunch(bass, lowMids, _transientState),
            Transient = Math.Clamp(_transientState, 0f, 1f),
            Energy = Math.Clamp(_energyState, 0f, 1f),
            IsActive = isActive,
            CapturedAt = DateTimeOffset.UtcNow.ToString("O")
        };
    }

    private void ResetState()
    {
        Array.Clear(_sampleWindow);
        Array.Clear(_fftReal);
        Array.Clear(_fftImaginary);
        Array.Clear(_targetDirectBands);
        Array.Clear(_directBandState);
        Array.Clear(_previousDirectBandTargets);
        _sampleWindowCount = 0;
        _targetLow = 0f;
        _targetMid = 0f;
        _targetHigh = 0f;
        _targetTransient = 0f;
        _targetEnergy = 0f;
        _lowState = 0f;
        _midState = 0f;
        _highState = 0f;
        _transientState = 0f;
        _energyState = 0f;
        _lastSampleAt = DateTimeOffset.MinValue;
        _startedAt = DateTimeOffset.MinValue;
        _captureDescription = null;
        _hasReportedWaitingForSignal = false;
        _hasReportedActiveSignal = false;
        _hasLockedSignalSource = false;
        _packetCount = 0;
        _silentPacketCount = 0;
        _capturedFrameCount = 0;
    }

    private void DecayPreviousDirectBandTargets()
    {
        for (int index = 0; index < _previousDirectBandTargets.Length; index += 1)
        {
            _previousDirectBandTargets[index] *= 0.5f;
        }
    }

    private void SmoothDirectBand(DirectBandIndex bandIndex, float attack, float release)
    {
        int index = (int)bandIndex;
        float target = _targetDirectBands[index];
        float current = _directBandState[index];
        float damping = target >= current ? attack : release;
        _directBandState[index] = current + ((target - current) * damping);
    }

    private double MeasureWeightedRange(int sampleRate, SpectrumRangeDefinition definition)
    {
        double nyquist = sampleRate / 2d;
        double maxFrequency = Math.Min(definition.MaxFrequency, nyquist);
        if (maxFrequency <= definition.MinFrequency)
        {
            return 0d;
        }

        int minBin = Math.Max(1, (int)Math.Floor((definition.MinFrequency * FftLength) / sampleRate));
        int maxBin = Math.Min((FftLength / 2) - 1, (int)Math.Ceiling((maxFrequency * FftLength) / sampleRate));
        if (maxBin < minBin)
        {
            return 0d;
        }

        double width = Math.Max(maxFrequency - definition.MinFrequency, 1d);
        double centerFrequency = definition.MinFrequency + (width * 0.5d);
        double halfWidth = width * 0.5d;
        double weightedSum = 0d;
        double weightTotal = 0d;

        for (int bin = minBin; bin <= maxBin; bin += 1)
        {
            double frequency = (bin * sampleRate) / (double)FftLength;
            if (frequency < definition.MinFrequency || frequency > maxFrequency)
            {
                continue;
            }

            double normalizedPosition = (frequency - definition.MinFrequency) / width;
            double edgeWeight = Math.Sin(Math.Clamp(normalizedPosition, 0d, 1d) * Math.PI);
            edgeWeight = Math.Pow(Math.Max(edgeWeight, 0d), 0.65d);
            double centerProximity = halfWidth <= double.Epsilon
                ? 1d
                : Math.Max(0d, 1d - (Math.Abs(frequency - centerFrequency) / halfWidth));
            double weight = (0.58d + (edgeWeight * 0.42d)) * (1d + (centerProximity * definition.CenterBias));
            double magnitude = Math.Sqrt((_fftReal[bin] * _fftReal[bin]) + (_fftImaginary[bin] * _fftImaginary[bin]));
            weightedSum += magnitude * weight;
            weightTotal += weight;
        }

        return weightTotal <= double.Epsilon ? 0d : weightedSum / weightTotal;
    }

    private static float NormalizeDirectBand(double rawAverage, double totalAverage, float energy, SpectrumRangeDefinition definition)
    {
        if (totalAverage <= double.Epsilon || rawAverage <= double.Epsilon)
        {
            return 0f;
        }

        double ratio = rawAverage / totalAverage;
        double shapedRatio = Math.Pow(Math.Clamp(ratio, 0d, 1d), definition.Exponent);
        return (float)Math.Clamp(energy * (0.08d + (shapedRatio * definition.Gain)), 0d, 1d);
    }

    private static double Clamp01(double value)
    {
        return Math.Clamp(value, 0d, 1d);
    }

    private static double ComputeVocalPresence(float mids, float presence, float treble, float energy)
    {
        return Clamp01((mids * 0.34d) + (presence * 0.54d) + (treble * 0.06d) + (energy * 0.06d));
    }

    private static double ComputeInstrumentPresence(float lowMids, float mids, float presence, float treble, float air, float energy)
    {
        return Clamp01((lowMids * 0.22d) + (mids * 0.32d) + (presence * 0.26d) + (treble * 0.1d) + (air * 0.04d) + (energy * 0.06d));
    }

    private static double ComputeWarmth(float bass, float lowMids)
    {
        return Clamp01((bass * 0.28d) + (lowMids * 0.72d));
    }

    private static double ComputeClarity(float presence, float treble, float air)
    {
        return Clamp01((presence * 0.68d) + (treble * 0.24d) + (air * 0.08d));
    }

    private static double ComputeBrightness(float treble, float air)
    {
        return Clamp01((treble * 0.72d) + (air * 0.28d));
    }

    private static double ComputePunch(float bass, float lowMids, float transient)
    {
        return Clamp01((bass * 0.46d) + (lowMids * 0.16d) + (transient * 0.38d));
    }

    private static float NormalizeEnergy(double rms)
    {
        double scaled = Math.Clamp(rms * 8.5d, 0d, 1d);
        return (float)Math.Clamp(Math.Pow(scaled, 0.68d), 0d, 1d);
    }

    private static float[] BuildHannWindow(int length)
    {
        float[] values = new float[length];

        for (int index = 0; index < length; index += 1)
        {
            values[index] = (float)(0.5d * (1d - Math.Cos((2d * Math.PI * index) / (length - 1))));
        }

        return values;
    }

    private static void PerformFft(double[] real, double[] imaginary)
    {
        int sampleCount = real.Length;
        int targetIndex = 0;

        for (int sampleIndex = 1; sampleIndex < sampleCount; sampleIndex += 1)
        {
            int bit = sampleCount >> 1;

            while ((targetIndex & bit) != 0)
            {
                targetIndex ^= bit;
                bit >>= 1;
            }

            targetIndex ^= bit;

            if (sampleIndex >= targetIndex)
            {
                continue;
            }

            (real[sampleIndex], real[targetIndex]) = (real[targetIndex], real[sampleIndex]);
            (imaginary[sampleIndex], imaginary[targetIndex]) = (imaginary[targetIndex], imaginary[sampleIndex]);
        }

        for (int blockLength = 2; blockLength <= sampleCount; blockLength <<= 1)
        {
            double angle = (-2d * Math.PI) / blockLength;
            double stepReal = Math.Cos(angle);
            double stepImaginary = Math.Sin(angle);
            int halfBlockLength = blockLength >> 1;

            for (int blockStart = 0; blockStart < sampleCount; blockStart += blockLength)
            {
                double currentReal = 1d;
                double currentImaginary = 0d;

                for (int offset = 0; offset < halfBlockLength; offset += 1)
                {
                    int evenIndex = blockStart + offset;
                    int oddIndex = evenIndex + halfBlockLength;
                    double oddReal = (real[oddIndex] * currentReal) - (imaginary[oddIndex] * currentImaginary);
                    double oddImaginary = (real[oddIndex] * currentImaginary) + (imaginary[oddIndex] * currentReal);

                    real[oddIndex] = real[evenIndex] - oddReal;
                    imaginary[oddIndex] = imaginary[evenIndex] - oddImaginary;
                    real[evenIndex] += oddReal;
                    imaginary[evenIndex] += oddImaginary;

                    double nextReal = (currentReal * stepReal) - (currentImaginary * stepImaginary);
                    currentImaginary = (currentReal * stepImaginary) + (currentImaginary * stepReal);
                    currentReal = nextReal;
                }
            }
        }
    }

    private static WaveFormatInfo ParseWaveFormat(IntPtr waveFormatPointer)
    {
        WaveFormatEx format = Marshal.PtrToStructure<WaveFormatEx>(waveFormatPointer);
        ushort formatTag = format.FormatTag;

        if (formatTag == WaveFormatExensibleTag && format.Size >= 22)
        {
            WaveFormatExtensible extensible = Marshal.PtrToStructure<WaveFormatExtensible>(waveFormatPointer);
            formatTag = extensible.SubFormat == FloatSubFormat
                ? IeeeFloatFormatTag
                : extensible.SubFormat == PcmSubFormat
                    ? PcmFormatTag
                    : formatTag;
        }

        SampleEncoding encoding = formatTag switch
        {
            IeeeFloatFormatTag => SampleEncoding.Float,
            PcmFormatTag => SampleEncoding.Pcm,
            _ => throw new NotSupportedException($"Unsupported loopback capture format tag {formatTag}.")
        };

        return new WaveFormatInfo(
            SampleRate: checked((int)format.SamplesPerSec),
            Channels: format.Channels,
            BitsPerSample: format.BitsPerSample,
            BlockAlign: format.BlockAlign,
            Encoding: encoding);
    }

    private static T ActivateInterface<T>(IMMDevice device) where T : class
    {
        Guid interfaceGuid = typeof(T).GUID;
        Marshal.ThrowExceptionForHR(device.Activate(ref interfaceGuid, ClsCtx.InprocServer, IntPtr.Zero, out object interfacePointer));
        return (T)interfacePointer;
    }

    private static T GetService<T>(IAudioClient audioClient) where T : class
    {
        Guid interfaceGuid = typeof(T).GUID;
        Marshal.ThrowExceptionForHR(audioClient.GetService(ref interfaceGuid, out object service));
        return (T)service;
    }

    private static string TryGetDeviceId(IMMDevice device)
    {
        try
        {
            Marshal.ThrowExceptionForHR(device.GetId(out string id));
            return id;
        }
        catch
        {
            return "unknown";
        }
    }

    private bool ShouldTryNextRole(ERole role, out string? detail)
    {
        lock (_syncRoot)
        {
            detail = null;

            if (_hasLockedSignalSource || _startedAt == DateTimeOffset.MinValue)
            {
                return false;
            }

            if (DateTimeOffset.UtcNow - _startedAt < TimeSpan.FromSeconds(4))
            {
                return false;
            }

            if (_energyState >= 0.02f)
            {
                return false;
            }

            detail = _captureDescription is null
                ? $"Role {role} did not expose usable audio. Packets: {_packetCount}, silent packets: {_silentPacketCount}, frames: {_capturedFrameCount}."
                : $"{_captureDescription}. Packets: {_packetCount}, silent packets: {_silentPacketCount}, frames: {_capturedFrameCount}.";
            return true;
        }
    }

    private enum DirectBandIndex
    {
        Bass,
        LowMids,
        Mids,
        Presence,
        Treble,
        Air
    }

    private static void ReleaseComObject(object? value)
    {
        if (value is not null && Marshal.IsComObject(value))
        {
            Marshal.FinalReleaseComObject(value);
        }
    }

    private const ushort PcmFormatTag = 0x0001;
    private const ushort IeeeFloatFormatTag = 0x0003;
    private const ushort WaveFormatExensibleTag = 0xFFFE;

    private readonly record struct SpectrumRangeDefinition(
        double MinFrequency,
        double MaxFrequency,
        double Gain,
        double Exponent,
        double CenterBias);

    private readonly record struct WaveFormatInfo(int SampleRate, int Channels, int BitsPerSample, int BlockAlign, SampleEncoding Encoding);

    private enum SampleEncoding
    {
        Pcm,
        Float
    }
}

[ComImport]
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
internal sealed class MMDeviceEnumeratorComObject
{
}

[ComImport]
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceEnumerator
{
    [PreserveSig]
    int EnumAudioEndpoints(EDataFlow dataFlow, DeviceState stateMask, out object devices);

    [PreserveSig]
    int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);

    [PreserveSig]
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);

    [PreserveSig]
    int RegisterEndpointNotificationCallback(IntPtr client);

    [PreserveSig]
    int UnregisterEndpointNotificationCallback(IntPtr client);
}

[ComImport]
[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice
{
    [PreserveSig]
    int Activate(ref Guid interfaceId, ClsCtx classContext, IntPtr activationParameters, [MarshalAs(UnmanagedType.Interface)] out object interfacePointer);

    [PreserveSig]
    int OpenPropertyStore(int storageAccessMode, out IntPtr properties);

    [PreserveSig]
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);

    [PreserveSig]
    int GetState(out DeviceState state);
}

[ComImport]
[Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioClient
{
    [PreserveSig]
    int Initialize(AudioClientShareMode shareMode, AudioClientStreamFlags streamFlags, long bufferDuration, long periodicity, IntPtr format, ref Guid audioSessionGuid);

    [PreserveSig]
    int GetBufferSize(out uint bufferSizeFrames);

    [PreserveSig]
    int GetStreamLatency(out long latency);

    [PreserveSig]
    int GetCurrentPadding(out uint currentPaddingFrames);

    [PreserveSig]
    int IsFormatSupported(AudioClientShareMode shareMode, IntPtr format, out IntPtr closestMatchFormat);

    [PreserveSig]
    int GetMixFormat(out IntPtr deviceFormat);

    [PreserveSig]
    int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);

    [PreserveSig]
    int Start();

    [PreserveSig]
    int Stop();

    [PreserveSig]
    int Reset();

    [PreserveSig]
    int SetEventHandle(IntPtr eventHandle);

    [PreserveSig]
    int GetService(ref Guid interfaceId, [MarshalAs(UnmanagedType.IUnknown)] out object service);
}

[ComImport]
[Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioCaptureClient
{
    [PreserveSig]
    int GetBuffer(out IntPtr data, out uint frameCount, out AudioClientBufferFlags flags, out ulong devicePosition, out ulong qpcPosition);

    [PreserveSig]
    int ReleaseBuffer(uint frameCount);

    [PreserveSig]
    int GetNextPacketSize(out uint frameCount);
}

[StructLayout(LayoutKind.Sequential, Pack = 2)]
internal struct WaveFormatEx
{
    public ushort FormatTag;
    public ushort Channels;
    public uint SamplesPerSec;
    public uint AvgBytesPerSec;
    public ushort BlockAlign;
    public ushort BitsPerSample;
    public ushort Size;
}

[StructLayout(LayoutKind.Sequential, Pack = 2)]
internal struct WaveFormatExtensible
{
    public WaveFormatEx Format;
    public ushort ValidBitsPerSample;
    public uint ChannelMask;
    public Guid SubFormat;
}

[Flags]
internal enum DeviceState : uint
{
    Active = 0x00000001,
    Disabled = 0x00000002,
    NotPresent = 0x00000004,
    Unplugged = 0x00000008,
    All = 0x0000000F
}

internal enum EDataFlow
{
    Render,
    Capture,
    All
}

internal enum ERole
{
    Console,
    Multimedia,
    Communications
}

internal enum AudioClientShareMode
{
    Shared,
    Exclusive
}

[Flags]
internal enum AudioClientStreamFlags : uint
{
    Loopback = 0x00020000
}

[Flags]
internal enum AudioClientBufferFlags : uint
{
    None = 0x0,
    DataDiscontinuity = 0x1,
    Silent = 0x2,
    TimestampError = 0x4
}

[Flags]
internal enum ClsCtx : uint
{
    InprocServer = 0x1
}
