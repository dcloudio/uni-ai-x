#Requires -Version 7
<#
.SYNOPSIS
  从 uni-ai-md 源码仓库同步公开头文件到 native/include/。

.DESCRIPTION
  构建准备时，把仓库 include/uni-ai-md/ 下的公开头文件和
  plugins/math/math_plugin.h、plugins/mermaid/mermaid_plugin.h 复制到本项目的
  native/include/。本脚本由 prepare-lib.ps1 固定调用；构建过程（build-harmony.ps1）
  只读取项目内内容。

  仓库根目录优先取 -RepoRoot，其次取 UNI_AI_MD_REPO 环境变量，未指定时
  默认取与本项目相邻的 ../../libmark。

.EXAMPLE
  pwsh -File native/sync-include.ps1
  pwsh -File native/sync-include.ps1 -RepoRoot D:\dev\dcloud\libmark
#>
param(
  [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'

$nativeDir = $PSScriptRoot
if ($RepoRoot) {
  $RepoRoot = (Resolve-Path $RepoRoot).Path
} elseif ($env:UNI_AI_MD_REPO) {
  $RepoRoot = (Resolve-Path $env:UNI_AI_MD_REPO).Path
} else {
  $RepoRoot = (Resolve-Path (Join-Path $nativeDir '../../libmark')).Path
}

$sourceInclude = Join-Path $RepoRoot 'include/uni-ai-md'
$sourceMath = Join-Path $RepoRoot 'plugins/math/math_plugin.h'
$sourceMermaid = Join-Path $RepoRoot 'plugins/mermaid/mermaid_plugin.h'
$targetInclude = Join-Path $nativeDir 'include/uni-ai-md'
$targetMath = Join-Path $nativeDir 'include/math_plugin.h'
$targetMermaid = Join-Path $nativeDir 'include/mermaid_plugin.h'

if (-not (Test-Path (Join-Path $sourceInclude 'core.h'))) {
  Write-Host "错误: 未找到 $sourceInclude，请确认 -RepoRoot 指向 uni-ai-md 仓库根目录" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path $sourceMath)) {
  Write-Host "错误: 未找到 $sourceMath" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path $sourceMermaid)) {
  Write-Host "错误: 未找到 $sourceMermaid" -ForegroundColor Red
  exit 1
}

$headers = @('allocator.h', 'core.h', 'diagnostic.h', 'plugin.h', 'render.h', 'session.h')
New-Item -ItemType Directory -Force -Path $targetInclude | Out-Null

function Copy-Header([string]$source, [string]$target, [string]$label) {
  $changed = -not (Test-Path $target) -or ((Get-FileHash $source).Hash -ne (Get-FileHash $target).Hash)
  Copy-Item -Force $source $target
  $state = if ($changed) { '已更新' } else { '无变化' }
  Write-Host "$state : $label"
}

foreach ($header in $headers) {
  $source = Join-Path $sourceInclude $header
  if (-not (Test-Path $source)) {
    Write-Host "错误: 缺少 $source" -ForegroundColor Red
    exit 1
  }
  Copy-Header $source (Join-Path $targetInclude $header) "native/include/uni-ai-md/$header"
}
Copy-Header $sourceMath $targetMath 'native/include/math_plugin.h'
Copy-Header $sourceMermaid $targetMermaid 'native/include/mermaid_plugin.h'

Write-Host '头文件同步完成' -ForegroundColor Green
