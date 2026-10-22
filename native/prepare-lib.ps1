#Requires -Version 7
<#
.SYNOPSIS
  同步 uni-ai-md 公开头文件，并把 libuni-ai-md.so 复制到 native/prebuilt/<平台>/<abi>/。

.DESCRIPTION
  构建准备步骤：先在 uni-ai-md 源码仓库根目录执行对应平台的构建脚本，再运行本脚本；
  harmony 对应 scripts/build-ohos.ps1，android 对应 scripts/build-android.ps1。
  仓库根目录必须通过 -RepoRoot 或 UNI_AI_MD_REPO 环境变量明确指定，
  未指定时报错退出。同步内容与复制产物均不提交到 git。

.EXAMPLE
  pwsh -File native/prepare-lib.ps1 -RepoRoot D:\dev\uni-ai-md
  pwsh -File native/prepare-lib.ps1 -Platform android -RepoRoot D:\dev\uni-ai-md
  $env:UNI_AI_MD_REPO = 'D:\dev\uni-ai-md'; pwsh -File native/prepare-lib.ps1
#>
param(
  [string]$RepoRoot = '',
  [ValidateSet('harmony', 'android')]
  [string]$Platform = 'harmony'
)

$ErrorActionPreference = 'Stop'

$nativeDir = $PSScriptRoot
if ($RepoRoot) {
  $RepoRoot = (Resolve-Path $RepoRoot).Path
} elseif ($env:UNI_AI_MD_REPO) {
  $RepoRoot = (Resolve-Path $env:UNI_AI_MD_REPO).Path
} else {
  Write-Host '错误: 未指定 uni-ai-md 源码仓库，请设置 UNI_AI_MD_REPO 环境变量或传入 -RepoRoot' -ForegroundColor Red
  exit 1
}

# HarmonyOS 与 Android 共用 dist/full/<config> 会互相覆盖，构建脚本按平台写到子目录。
# HarmonyOS 交付 arm64-v8a 与 x86_64（模拟器）两种 ABI，Android 只交付 arm64-v8a。
if ($Platform -eq 'android') {
  $copies = @(
    @{ Source = 'dist/full/android-arm64/Release/libuni-ai-md.so'
       TargetDir = 'prebuilt/android-arm64-v8a' }
  )
  $buildHint = 'pwsh -File scripts/build-android.ps1'
} else {
  $copies = @(
    @{ Source = 'dist/full/ohos-arm64/Release/libuni-ai-md.so'
       TargetDir = 'prebuilt/arm64-v8a' },
    @{ Source = 'dist/full/ohos-x86_64/Release/libuni-ai-md.so'
       TargetDir = 'prebuilt/x86_64' }
  )
  $buildHint = 'pwsh -File scripts/build-ohos.ps1'
}

foreach ($copy in $copies) {
  $source = Join-Path $RepoRoot $copy.Source
  if (Test-Path $source) { continue }
  Write-Host "错误: 未找到 $source" -ForegroundColor Red
  Write-Host "请先在 uni-ai-md 仓库根目录执行: $buildHint" -ForegroundColor Yellow
  exit 1
}

& (Join-Path $nativeDir 'sync-include.ps1') -RepoRoot $RepoRoot

foreach ($copy in $copies) {
  $source = Join-Path $RepoRoot $copy.Source
  $targetDir = Join-Path $nativeDir $copy.TargetDir
  $target = Join-Path $targetDir 'libuni-ai-md.so'
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  $changed = -not (Test-Path $target) -or ((Get-FileHash $source).Hash -ne (Get-FileHash $target).Hash)
  Copy-Item -Force $source $target
  $state = if ($changed) { '已更新' } else { '无变化' }
  Write-Host "$state : $target" -ForegroundColor Green
}
