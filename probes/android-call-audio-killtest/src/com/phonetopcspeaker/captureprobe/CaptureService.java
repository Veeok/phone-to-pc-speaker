package com.phonetopcspeaker.captureprobe;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Environment;
import android.os.IBinder;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public final class CaptureService extends Service {
    private static final String CHANNEL_ID = "capture";
    private static final int NOTIFICATION_ID = 7;
    private static final String ACTION_START = "start";
    private static final String ACTION_STOP = "stop";
    private static final String EXTRA_RESULT_CODE = "result_code";
    private static final String EXTRA_RESULT_DATA = "result_data";
    private static final String PREFS = "capture_probe";
    private static final String PREF_STATE = "last_state";
    private static final String PREF_DETAIL = "last_detail";
    private static final String PREF_FILE_PATH = "last_file_path";
    private static final String PREF_CAPTURED_BYTES = "last_captured_bytes";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private Future<?> captureTask;
    private volatile boolean stopRequested;
    private volatile long capturedBytes;
    private volatile File outputFile;
    private volatile AudioRecord audioRecord;
    private volatile MediaProjection mediaProjection;

    public static Intent createStartIntent(Context context, int resultCode, Intent resultData) {
        Intent intent = new Intent(context, CaptureService.class);
        intent.setAction(ACTION_START);
        intent.putExtra(EXTRA_RESULT_CODE, resultCode);
        intent.putExtra(EXTRA_RESULT_DATA, resultData);
        return intent;
    }

    public static Intent createStopIntent(Context context) {
        Intent intent = new Intent(context, CaptureService.class);
        intent.setAction(ACTION_STOP);
        return intent;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            requestStop("Stopped by user.");
            return START_NOT_STICKY;
        }

        if (!ACTION_START.equals(action)) {
            return START_NOT_STICKY;
        }

        if (captureTask != null) {
            broadcastStatus("failed", "Capture is already running.", outputFile, capturedBytes);
            return START_NOT_STICKY;
        }

        createNotificationChannel();
        startInForeground("Preparing capture");

        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent resultData = getResultData(intent);
        captureTask = executor.submit(new Runnable() {
            @Override
            public void run() {
                runCapture(resultCode, resultData);
            }
        });
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        requestStop("Service destroyed.");
        executor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void runCapture(int resultCode, Intent resultData) {
        WavFileWriter writer = null;
        String finalState = "stopped";
        String finalDetail = "Capture stopped.";

        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                throw new IllegalStateException("Playback capture requires Android 10 or newer.");
            }

            if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                throw new SecurityException("RECORD_AUDIO permission is required.");
            }

            if (resultData == null) {
                throw new IllegalStateException("MediaProjection consent data was missing.");
            }

            MediaProjectionManager projectionManager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
            mediaProjection = projectionManager.getMediaProjection(resultCode, resultData);
            if (mediaProjection == null) {
                throw new IllegalStateException("MediaProjection could not be created.");
            }

            int sampleRate = 48000;
            int channelMask = AudioFormat.CHANNEL_IN_STEREO;
            int encoding = AudioFormat.ENCODING_PCM_16BIT;
            int channelCount = 2;
            AudioFormat audioFormat = new AudioFormat.Builder()
                .setSampleRate(sampleRate)
                .setChannelMask(channelMask)
                .setEncoding(encoding)
                .build();

            AudioPlaybackCaptureConfiguration config = new AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build();

            int minimumBuffer = AudioRecord.getMinBufferSize(sampleRate, channelMask, encoding);
            if (minimumBuffer <= 0) {
                throw new IllegalStateException("AudioRecord.getMinBufferSize returned " + minimumBuffer + '.');
            }

            audioRecord = new AudioRecord.Builder()
                .setAudioFormat(audioFormat)
                .setAudioPlaybackCaptureConfig(config)
                .setBufferSizeInBytes(minimumBuffer * 4)
                .build();

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                throw new IllegalStateException("AudioRecord did not initialize for playback capture.");
            }

            outputFile = createOutputFile();
            writer = new WavFileWriter(outputFile, sampleRate, (short) channelCount, (short) 16);
            capturedBytes = 0L;
            stopRequested = false;

            audioRecord.startRecording();
            updateNotification("Recording capture to local WAV");
            broadcastStatus("recording", "Recording playback capture to a local WAV file.", outputFile, capturedBytes);

            byte[] buffer = new byte[minimumBuffer];
            long lastBroadcastAt = System.currentTimeMillis();

            while (!stopRequested) {
                int read = audioRecord.read(buffer, 0, buffer.length);
                if (read > 0) {
                    writer.write(buffer, 0, read);
                    capturedBytes += read;
                } else if (read < 0) {
                    throw new IllegalStateException("AudioRecord.read returned " + read + '.');
                }

                long now = System.currentTimeMillis();
                if (now - lastBroadcastAt >= 1000L) {
                    broadcastStatus("recording", "Recording playback capture to a local WAV file.", outputFile, capturedBytes);
                    lastBroadcastAt = now;
                }
            }

            finalDetail = "Capture stopped. Inspect the saved WAV locally before adding any PC forwarding path.";
        } catch (Exception exception) {
            finalState = "failed";
            finalDetail = exception.getClass().getSimpleName() + ": " + exception.getMessage();
        } finally {
            cleanupCapture(writer);
            broadcastStatus(finalState, finalDetail, outputFile, capturedBytes);
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
        }
    }

    private void cleanupCapture(WavFileWriter writer) {
        if (audioRecord != null) {
            try {
                audioRecord.stop();
            } catch (IllegalStateException ignored) {
            }

            audioRecord.release();
            audioRecord = null;
        }

        if (writer != null) {
            try {
                writer.close();
            } catch (IOException ignored) {
            }
        }

        if (mediaProjection != null) {
            mediaProjection.stop();
            mediaProjection = null;
        }

        captureTask = null;
    }

    private void requestStop(String detail) {
        stopRequested = true;

        if (audioRecord != null) {
            try {
                audioRecord.stop();
            } catch (IllegalStateException ignored) {
            }
        }

        broadcastStatus("stopping", detail, outputFile, capturedBytes);
    }

    private void startInForeground(String detail) {
        Notification notification = buildNotification(detail);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void updateNotification(String detail) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, buildNotification(detail));
    }

    private Notification buildNotification(String detail) {
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        return builder
            .setContentTitle("Call Audio Kill Test")
            .setContentText(detail)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setOngoing(true)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Capture", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Disposable playback capture status");

        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.createNotificationChannel(channel);
    }

    private void broadcastStatus(String state, String detail, File file, long bytes) {
        persistStatus(state, detail, file, bytes);

        Intent intent = new Intent(Broadcasts.ACTION_STATUS);
        intent.setPackage(getPackageName());
        intent.putExtra(Broadcasts.EXTRA_STATE, state);
        intent.putExtra(Broadcasts.EXTRA_DETAIL, detail);
        intent.putExtra(Broadcasts.EXTRA_FILE_PATH, file == null ? null : file.getAbsolutePath());
        intent.putExtra(Broadcasts.EXTRA_CAPTURED_BYTES, bytes);
        sendBroadcast(intent);
    }

    private void persistStatus(String state, String detail, File file, long bytes) {
        SharedPreferences preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        preferences.edit()
            .putString(PREF_STATE, state)
            .putString(PREF_DETAIL, detail)
            .putString(PREF_FILE_PATH, file == null ? null : file.getAbsolutePath())
            .putLong(PREF_CAPTURED_BYTES, bytes)
            .apply();
    }

    static SharedPreferences getPreferences(Context context) {
        return context.getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private File createOutputFile() throws IOException {
        File baseDirectory = getExternalFilesDir(Environment.DIRECTORY_MUSIC);
        if (baseDirectory == null) {
            baseDirectory = getFilesDir();
        }

        if (!baseDirectory.exists() && !baseDirectory.mkdirs()) {
            throw new IOException("Could not create output directory: " + baseDirectory.getAbsolutePath());
        }

        String timestamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
        return new File(baseDirectory, "capture-" + timestamp + ".wav");
    }

    private Intent getResultData(Intent container) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return container.getParcelableExtra(EXTRA_RESULT_DATA, Intent.class);
        }

        return container.getParcelableExtra(EXTRA_RESULT_DATA);
    }
}
