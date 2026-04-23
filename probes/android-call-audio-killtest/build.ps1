$ErrorActionPreference = 'Stop'

$sdkRoot = if ($env:ANDROID_HOME) {
    $env:ANDROID_HOME
} elseif ($env:ANDROID_SDK_ROOT) {
    $env:ANDROID_SDK_ROOT
} else {
    Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}

$buildToolsVersion = '34.0.0'
$legacyBuildToolsVersion = '30.0.3'
$platformVersion = 'android-34'
$buildToolsPath = Join-Path $sdkRoot "build-tools\$buildToolsVersion"
$legacyBuildToolsPath = Join-Path $sdkRoot "build-tools\$legacyBuildToolsVersion"
$platformPath = Join-Path $sdkRoot "platforms\$platformVersion"
$androidJar = Join-Path $platformPath 'android.jar'
$javaHomes = @(
    'C:\Program Files\Java\jdk-21.0.10',
    'C:\Program Files\Java\jdk-25.0.2'
)
$javaHome = $javaHomes | Where-Object { Test-Path (Join-Path $_ 'bin\javac.exe') } | Select-Object -First 1

if (-not $javaHome) {
    throw 'A JDK with javac.exe was not found under C:\Program Files\Java.'
}

$javacPath = Join-Path $javaHome 'bin\javac.exe'
$javaPath = Join-Path $javaHome 'bin\java.exe'
$jarPath = Join-Path $javaHome 'bin\jar.exe'
$keytoolPath = Join-Path $javaHome 'bin\keytool.exe'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path $androidJar)) {
    throw "Android platform jar not found at $androidJar"
}

if (-not (Test-Path (Join-Path $buildToolsPath 'aapt2.exe'))) {
    throw "Android build-tools not found at $buildToolsPath"
}

if (-not (Test-Path (Join-Path $legacyBuildToolsPath 'dx.bat'))) {
    throw "Legacy Android build-tools with dx were not found at $legacyBuildToolsPath"
}

$projectRoot = $PSScriptRoot
$manifestPath = Join-Path $projectRoot 'AndroidManifest.xml'
$sourceRoot = Join-Path $projectRoot 'src'
$outputRoot = Join-Path $projectRoot 'out'
$classesRoot = Join-Path $outputRoot 'classes'
$dexRoot = Join-Path $outputRoot 'dex'
$unsignedApk = Join-Path $outputRoot 'call-audio-killtest-unsigned.apk'
$alignedApk = Join-Path $outputRoot 'call-audio-killtest-aligned.apk'
$signedApk = Join-Path $outputRoot 'call-audio-killtest-debug.apk'
$keystorePath = Join-Path $projectRoot 'debug.keystore'

if (Test-Path $outputRoot) {
    Remove-Item -Recurse -Force $outputRoot
}

New-Item -ItemType Directory -Force -Path $outputRoot, $classesRoot, $dexRoot | Out-Null

$javaFiles = Get-ChildItem -Path $sourceRoot -Recurse -Filter '*.java' | Sort-Object FullName
if ($javaFiles.Count -eq 0) {
    throw 'No Java source files were found.'
}

$javacArgs = @(
    '-source', '8',
    '-target', '8',
    '-Xlint:-options',
    '-encoding', 'UTF-8',
    '-bootclasspath', $androidJar,
    '-d', $classesRoot
) + $javaFiles.FullName

& $javacPath @javacArgs
if ($LASTEXITCODE -ne 0) {
    throw "javac failed with exit code $LASTEXITCODE"
}

$classFiles = Get-ChildItem -Path $classesRoot -Recurse -Filter '*.class' | Sort-Object FullName | ForEach-Object { $_.FullName }
if ($classFiles.Count -eq 0) {
    throw 'No compiled .class files were produced.'
}

$classesDexPath = Join-Path $dexRoot 'classes.dex'
$classesJarPath = Join-Path $outputRoot 'classes.jar'
$jarArgs = @('cf', $classesJarPath, '-C', $classesRoot, '.')
& $jarPath @jarArgs
if ($LASTEXITCODE -ne 0) {
    throw "jar failed with exit code $LASTEXITCODE"
}

$dxJarPath = Join-Path $legacyBuildToolsPath 'lib\dx.jar'
$dxArgs = @('-cp', $dxJarPath, 'com.android.dx.command.Main', '--dex', "--output=$classesDexPath", $classesJarPath)
& $javaPath @dxArgs
if ($LASTEXITCODE -ne 0) {
    throw "dx failed with exit code $LASTEXITCODE"
}

& (Join-Path $buildToolsPath 'aapt2.exe') link --manifest $manifestPath --min-sdk-version 29 --target-sdk-version 34 -I $androidJar -o $unsignedApk
if ($LASTEXITCODE -ne 0) {
    throw "aapt2 link failed with exit code $LASTEXITCODE"
}

$archive = [System.IO.Compression.ZipFile]::Open($unsignedApk, [System.IO.Compression.ZipArchiveMode]::Update)
try {
    $existingEntry = $archive.GetEntry('classes.dex')
    if ($existingEntry -ne $null) {
        $existingEntry.Delete()
    }

    $entry = $archive.CreateEntry('classes.dex')
    $entryStream = $entry.Open()
    $sourceStream = [System.IO.File]::OpenRead($classesDexPath)

    try {
        $sourceStream.CopyTo($entryStream)
    } finally {
        $sourceStream.Dispose()
        $entryStream.Dispose()
    }
} finally {
    $archive.Dispose()
}

& (Join-Path $buildToolsPath 'zipalign.exe') -f 4 $unsignedApk $alignedApk
if ($LASTEXITCODE -ne 0) {
    throw "zipalign failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $keystorePath)) {
    & $keytoolPath -genkeypair -v -keystore $keystorePath -alias androiddebugkey -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000
    if ($LASTEXITCODE -ne 0) {
        throw "keytool failed with exit code $LASTEXITCODE"
    }
}

& (Join-Path $buildToolsPath 'apksigner.bat') sign --ks $keystorePath --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out $signedApk $alignedApk
if ($LASTEXITCODE -ne 0) {
    throw "apksigner sign failed with exit code $LASTEXITCODE"
}

& (Join-Path $buildToolsPath 'apksigner.bat') verify --verbose $signedApk
if ($LASTEXITCODE -ne 0) {
    throw "apksigner verify failed with exit code $LASTEXITCODE"
}

Write-Output "Built $signedApk"
