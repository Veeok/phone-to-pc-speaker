package com.phonetopcspeaker.captureprobe;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.text.method.ScrollingMovementMethod;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private static final int REQUEST_RECORD_AUDIO = 1001;
    private static final int REQUEST_MEDIA_PROJECTION = 1002;

    private MediaProjectionManager projectionManager;
    private Intent projectionData;
    private int projectionResultCode;

    private TextView statusView;
    private boolean receiverRegistered;

    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            renderStatus(
                intent.getStringExtra(Broadcasts.EXTRA_STATE),
                intent.getStringExtra(Broadcasts.EXTRA_DETAIL),
                intent.getStringExtra(Broadcasts.EXTRA_FILE_PATH),
                intent.getLongExtra(Broadcasts.EXTRA_CAPTURED_BYTES, 0L)
            );
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        projectionManager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        projectionResultCode = RESULT_CANCELED;
        setTitle("Call Audio Kill Test");
        setContentView(buildContentView());
        renderStoredStatus();
    }

    @Override
    protected void onStart() {
        super.onStart();

        if (!receiverRegistered) {
            IntentFilter filter = new IntentFilter(Broadcasts.ACTION_STATUS);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(statusReceiver, filter, RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(statusReceiver, filter);
            }
            receiverRegistered = true;
        }

        renderStoredStatus();
    }

    @Override
    protected void onStop() {
        if (receiverRegistered) {
            unregisterReceiver(statusReceiver);
            receiverRegistered = false;
        }

        super.onStop();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == REQUEST_RECORD_AUDIO) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                requestProjectionConsent();
            } else {
                renderStatus("failed", "RECORD_AUDIO permission was denied.", null, 0L);
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode != REQUEST_MEDIA_PROJECTION) {
            return;
        }

        if (resultCode == RESULT_OK && data != null) {
            projectionResultCode = resultCode;
            projectionData = new Intent(data);
            renderStatus("ready", "Projection consent granted. Start the target scenario, then tap Start Recording. On Android 14+, grant capture again for each repetition.", null, 0L);
        } else {
            renderStatus("failed", "MediaProjection consent was denied.", null, 0L);
        }
    }

    private ScrollView buildContentView() {
        int padding = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 16, getResources().getDisplayMetrics());

        ScrollView scrollView = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(padding, padding, padding, padding);

        TextView heading = new TextView(this);
        heading.setText("Disposable feasibility probe for Android playback capture. Save local WAV files first. Do not build more until target call audio is proven.");
        heading.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        root.addView(heading, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView order = new TextView(this);
        order.setText("Test order:\n1. Positive-control media playback\n2. Discord voice call\n3. WhatsApp audio call\n4. Generic VoIP app\n5. Carrier/system call negative control");
        order.setPadding(0, padding, 0, padding);
        root.addView(order, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button grantCaptureButton = new Button(this);
        grantCaptureButton.setText("Grant Capture");
        grantCaptureButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                ensurePermissionThenRequestProjection();
            }
        });
        root.addView(grantCaptureButton, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button startButton = new Button(this);
        startButton.setText("Start Recording");
        startButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                startRecording();
            }
        });
        root.addView(startButton, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button stopButton = new Button(this);
        stopButton.setText("Stop Recording");
        stopButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                stopService(CaptureService.createStopIntent(MainActivity.this));
            }
        });
        root.addView(stopButton, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        statusView = new TextView(this);
        statusView.setPadding(0, padding, 0, 0);
        statusView.setTextIsSelectable(true);
        statusView.setMovementMethod(new ScrollingMovementMethod());
        root.addView(statusView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        scrollView.addView(root);
        return scrollView;
    }

    private void ensurePermissionThenRequestProjection() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, REQUEST_RECORD_AUDIO);
            return;
        }

        requestProjectionConsent();
    }

    private void requestProjectionConsent() {
        startActivityForResult(projectionManager.createScreenCaptureIntent(), REQUEST_MEDIA_PROJECTION);
    }

    private void startRecording() {
        if (projectionData == null) {
            renderStatus("failed", "Grant capture first. On Android 14+, you should expect to do this before each repetition.", null, 0L);
            return;
        }

        Intent serviceIntent = CaptureService.createStartIntent(this, projectionResultCode, projectionData);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }

        projectionData = null;
        projectionResultCode = RESULT_CANCELED;
        renderStatus("starting", "Capture service is starting. Grant capture again before the next run if Android requires one-shot consent.", null, 0L);
    }

    private void renderStoredStatus() {
        SharedPreferences preferences = CaptureService.getPreferences(this);
        renderStatus(
            preferences.getString("last_state", "idle"),
            preferences.getString("last_detail", "No capture has been run yet."),
            preferences.getString("last_file_path", null),
            preferences.getLong("last_captured_bytes", 0L)
        );
    }

    private void renderStatus(String state, String detail, String filePath, long capturedBytes) {
        StringBuilder builder = new StringBuilder();
        builder.append("State: ").append(state == null ? "unknown" : state).append("\n\n");
        builder.append("Detail: ").append(detail == null ? "none" : detail).append("\n\n");
        builder.append("Captured bytes: ").append(capturedBytes).append("\n\n");
        builder.append("Last file: ").append(filePath == null ? "none" : filePath).append("\n\n");
        builder.append("Pass rule for a scenario: the saved WAV must contain clear remote-party or target playback audio, reproducibly, without hacks.\n\n");
        builder.append("Stop rule: if positive-control media fails, or Discord and WhatsApp both fail on the first real device cluster, stop the probe.");
        statusView.setText(builder.toString());
    }
}
