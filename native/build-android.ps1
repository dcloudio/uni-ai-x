#Requires -Version 7
<#
.SYNOPSIS
  编译 libuni-ai-md_bridge.so（Android JNI）并把桥接库与 libuni-ai-md.so 放进 UTS 插件目录。

.DESCRIPTION
  构建过程只使用本项目目录内的内容：
    native/android/                      JNI 桥接源码与 CMake 工程
    native/include/                      uni-ai-md 公开头文件快照
    native/prebuilt/android-arm64-v8a/   Android 版 libuni-ai-md.so（不提交到 git）
  缺少预编译库时按 README 的构建准备步骤先准备。

  需要 Android NDK：优先使用环境变量 ANDROID_NDK_HOME，未设置时在
  D:\ProgramFiles\Android\Sdk\ndk、D:\ProgramFiles\AndroidSDK\ndk 与
  D:\ProgramFiles\android-ndk-* 下查找。

.EXAMPLE
  pwsh -File native/build-android.ps1
#>
$ErrorActionPreference = 'Stop'

$nativeDir = $PSScriptRoot
$projectDir = Split-Path -Parent $nativeDir
$targetAbi = 'arm64-v8a'
$targetPlatform = 'android-24'
$prebuiltLib = Join-Path $nativeDir 'prebuilt/android-arm64-v8a/libuni-ai-md.so'
# uts 插件把 libs/<abi>/ 作为 jniLibs 源目录，so 必须落在 ABI 子目录里；
# 平铺在 libs/ 下会被 Gradle 当成“名字叫 libuni-ai-md.so 的 ABI”而打包失败。
$pluginLibsDir = Join-Path $projectDir "uni_modules/uni-ai-md/utssdk/app-android/libs/$targetAbi"
$buildDir = Join-Path $nativeDir 'build/android'

function Write-Fail([string]$message) {
  Write-Host "错误: $message" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $prebuiltLib)) {
  Write-Fail @"
缺少 native/prebuilt/android-arm64-v8a/libuni-ai-md.so。
构建准备步骤（详见 native/README.md）：
  1. 在 uni-ai-md 仓库根目录执行: pwsh -File scripts/build-android.ps1
  2. 执行: pwsh -File native/prepare-lib.ps1 -Platform android
"@
}

$ndkCandidates = @()
if ($env:ANDROID_NDK_HOME) { $ndkCandidates += $env:ANDROID_NDK_HOME }
if ($env:ANDROID_SDK_ROOT) { $ndkCandidates += (Join-Path $env:ANDROID_SDK_ROOT 'ndk') }
$sdkRoots = @('D:\ProgramFiles\Android\Sdk', 'D:\ProgramFiles\AndroidSDK')
foreach ($root in $sdkRoots) {
  $ndkRoot = Join-Path $root 'ndk'
  if (Test-Path $ndkRoot) {
    Get-ChildItem $ndkRoot -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending | ForEach-Object { $ndkCandidates += $_.FullName }
  }
}
Get-ChildItem 'D:\ProgramFiles' -Filter 'android-ndk-*' -Directory -ErrorAction SilentlyContinue |
  ForEach-Object { $ndkCandidates += $_.FullName }

$ndk = $null
foreach ($candidate in $ndkCandidates) {
  if (-not $candidate) { continue }
  $toolchainProbe = Join-Path $candidate 'build/cmake/android.toolchain.cmake'
  if (Test-Path $toolchainProbe) { $ndk = $candidate; break }
}
if (-not $ndk) {
  Write-Fail '未找到 Android NDK，请设置 ANDROID_NDK_HOME 指向 NDK 根目录。'
}

# 构建统一使用 DevEco Native SDK 自带的 CMake/Ninja（与本仓库其它构建脚本一致）。
$native = 'D:/ProgramFiles/Huawei/DevEco Studio/sdk/default/openharmony/native'
$cmakeBin = "$native/build-tools/cmake/bin"
if (-not (Test-Path "$cmakeBin/cmake.exe")) {
  Write-Fail "未找到 CMake: $cmakeBin/cmake.exe"
}

$toolchain = Join-Path $ndk 'build/cmake/android.toolchain.cmake'
Write-Host "使用 Android NDK: $ndk"

& "$cmakeBin/cmake.exe" -S (Join-Path $nativeDir 'android') -B $buildDir -G Ninja `
  "-DCMAKE_MAKE_PROGRAM=$cmakeBin/ninja.exe" `
  "-DCMAKE_TOOLCHAIN_FILE=$toolchain" `
  "-DANDROID_ABI=$targetAbi" `
  "-DANDROID_PLATFORM=$targetPlatform" `
  -DANDROID_STL=c++_static `
  -DCMAKE_BUILD_TYPE=Release
if ($LASTEXITCODE -ne 0) { Write-Fail 'CMake 配置失败' }

& "$cmakeBin/cmake.exe" --build $buildDir --target uni_ai_md_bridge --parallel 1
if ($LASTEXITCODE -ne 0) { Write-Fail 'uni_ai_md_bridge 编译失败' }

$bridgeSo = Join-Path $buildDir "libs/$targetAbi/libuni-ai-md_bridge.so"
if (-not (Test-Path $bridgeSo)) { Write-Fail "未生成 $bridgeSo" }

New-Item -ItemType Directory -Force -Path $pluginLibsDir | Out-Null
Copy-Item -Force $bridgeSo $pluginLibsDir
Copy-Item -Force $prebuiltLib $pluginLibsDir

$readElf = Join-Path $ndk 'toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-readelf.exe'
if (Test-Path $readElf) {
  Write-Host 'libuni-ai-md_bridge.so NEEDED:'
  & $readElf -d $bridgeSo | Select-String 'NEEDED' | ForEach-Object { $_.Line.Trim() }
}

Write-Host "已生成 $(Join-Path $pluginLibsDir 'libuni-ai-md_bridge.so') 与 libuni-ai-md.so" -ForegroundColor Green
