#Requires -Version 7
<#
.SYNOPSIS
  编译 libmark_bridge.so 并打包 libmark.har 到 UTS 插件目录。

.DESCRIPTION
  构建过程只使用本项目目录内的内容：
    native/harmony/            桥接库源码、CMake 工程和 HAR 骨架
    native/include/            libmark 公开头文件快照
    native/prebuilt/<abi>/     预编译的 libmark-full.so（不提交到 git）
  缺少预编译库时按 native/README.md 的构建准备步骤先准备。

  HAR 同时打包 arm64-v8a 与 x86_64（模拟器）两种 ABI 的桥接库和 libmark-full.so，
  与 UTS 插件 app-harmony 的 deviceArchs 保持一致。

  需要 DevEco Studio 的 HarmonyOS Native SDK；可通过环境变量
  OHOS_NATIVE_HOME 指定 native 目录，未设置时按常见安装路径查找。

.EXAMPLE
  pwsh -File native/build-harmony.ps1
#>
$ErrorActionPreference = 'Stop'

$nativeDir = $PSScriptRoot
$projectDir = Split-Path -Parent $nativeDir
$harDir = Join-Path $projectDir 'uni_modules/libmark/utssdk/app-harmony/libs'
$harPath = Join-Path $harDir 'libmark.har'
$stageDir = Join-Path $nativeDir 'build/stage'

# HAR 覆盖的 ABI：真机 arm64-v8a、模拟器 x86_64。
$abis = @('arm64-v8a', 'x86_64')

function Write-Fail([string]$message) {
  Write-Host "错误: $message" -ForegroundColor Red
  exit 1
}

foreach ($abi in $abis) {
  $prebuiltLib = Join-Path $nativeDir "prebuilt/$abi/libmark-full.so"
  if (Test-Path $prebuiltLib) { continue }
  Write-Fail @"
缺少 native/prebuilt/$abi/libmark-full.so。
构建准备步骤（详见 native/README.md）：
  1. 在 libmark 仓库根目录执行: pwsh -File scripts/build-ohos.ps1
  2. 执行: pwsh -File native/prepare-lib.ps1
"@
}

$ohosCandidates = @()
if ($env:OHOS_NATIVE_HOME) { $ohosCandidates += $env:OHOS_NATIVE_HOME }
if ($env:DEVECO_SDK_HOME) { $ohosCandidates += (Join-Path $env:DEVECO_SDK_HOME 'default/openharmony/native') }
$ohosCandidates += 'D:\ProgramFiles\Huawei\DevEco Studio\sdk\default\openharmony\native'
Get-ChildItem 'D:\ProgramFiles\Huawei' -Filter 'DevEco Studio*' -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  $ohosCandidates += (Join-Path $_.FullName 'sdk/default/openharmony/native')
}

$ohosNative = $null
foreach ($candidate in $ohosCandidates) {
  if (-not $candidate) { continue }
  $cmakeProbe = Join-Path $candidate 'build-tools/cmake/bin/cmake.exe'
  if (Test-Path $cmakeProbe) { $ohosNative = $candidate; break }
}
if (-not $ohosNative) {
  Write-Fail '未找到 DevEco Studio 的 HarmonyOS Native SDK，请设置 OHOS_NATIVE_HOME 指向 native 目录。'
}

$cmake = Join-Path $ohosNative 'build-tools/cmake/bin/cmake.exe'
$ninja = Join-Path $ohosNative 'build-tools/cmake/bin/ninja.exe'
$toolchain = Join-Path $ohosNative 'build/cmake/ohos.toolchain.cmake'
if (-not (Test-Path $ninja) -or -not (Test-Path $toolchain)) {
  Write-Fail "HarmonyOS Native SDK 不完整: $ohosNative"
}

Write-Host "使用 HarmonyOS Native SDK: $ohosNative"

$bridgeLibs = @()
foreach ($abi in $abis) {
  $buildDir = Join-Path $nativeDir "build/harmony/$abi"
  New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
  & $cmake -S (Join-Path $nativeDir 'harmony') -B $buildDir -G Ninja `
    -DCMAKE_BUILD_TYPE=Release `
    -DCMAKE_MAKE_PROGRAM="$ninja" `
    -DCMAKE_TOOLCHAIN_FILE="$toolchain" `
    "-DOHOS_ARCH=$abi" `
    -DOHOS_STL=c++_shared `
    "-DOHOS_NATIVE_ROOT=$ohosNative"
  if ($LASTEXITCODE -ne 0) { Write-Fail "$abi CMake 配置失败" }

  & $cmake --build $buildDir --target libmark_bridge --parallel
  if ($LASTEXITCODE -ne 0) { Write-Fail "$abi libmark_bridge 编译失败" }

  $bridgeSo = Join-Path $buildDir "libs/$abi/libmark_bridge.so"
  if (-not (Test-Path $bridgeSo)) { Write-Fail "未生成 $bridgeSo" }
  $bridgeLibs += @{ Abi = $abi; Bridge = $bridgeSo }
}

if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
$packageDir = Join-Path $stageDir 'package'
Copy-Item -Recurse (Join-Path $nativeDir 'harmony/package') $packageDir
foreach ($bridgeLib in $bridgeLibs) {
  $libsDir = Join-Path $packageDir "libs/$($bridgeLib.Abi)"
  New-Item -ItemType Directory -Force -Path $libsDir | Out-Null
  Copy-Item $bridgeLib.Bridge $libsDir
  Copy-Item (Join-Path $nativeDir "prebuilt/$($bridgeLib.Abi)/libmark-full.so") $libsDir
}

New-Item -ItemType Directory -Force -Path $harDir | Out-Null
if (Test-Path $harPath) { Remove-Item -Force $harPath }
# 在输出目录内用相对文件名调用 tar：msys/gnu tar 会把带盘符的绝对路径当作远端主机。
Push-Location $harDir
try {
  & tar -czf 'libmark.har' -C $stageDir package
  if ($LASTEXITCODE -ne 0) { Write-Fail 'HAR 打包失败' }
} finally {
  Pop-Location
}

$readelf = Join-Path $ohosNative 'llvm/bin/llvm-readelf.exe'
if (Test-Path $readelf) {
  foreach ($bridgeLib in $bridgeLibs) {
    Write-Host "libmark_bridge.so ($($bridgeLib.Abi)) NEEDED:"
    & $readelf -d $bridgeLib.Bridge | Select-String 'NEEDED' |
      ForEach-Object { $_.Line.Trim() }
  }
}

Write-Host "已生成 $harPath" -ForegroundColor Green
