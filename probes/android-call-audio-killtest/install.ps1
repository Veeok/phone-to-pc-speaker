$ErrorActionPreference = 'Stop'

$sdkRoot = if ($env:ANDROID_HOME) {
    $env:ANDROID_HOME
} elseif ($env:ANDROID_SDK_ROOT) {
    $env:ANDROID_SDK_ROOT
} else {
    Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}

$adbPath = Join-Path $sdkRoot 'platform-tools\adb.exe'
$apkPath = Join-Path $PSScriptRoot 'out\call-audio-killtest-debug.apk'

if (-not (Test-Path $adbPath)) {
    throw "adb was not found at $adbPath"
}

if (-not (Test-Path $apkPath)) {
    throw "APK was not found at $apkPath. Run build.ps1 first."
}

& $adbPath devices
& $adbPath install -r $apkPath
& $adbPath shell am start -n com.phonetopcspeaker.captureprobe/.MainActivity
