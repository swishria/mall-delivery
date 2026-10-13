# 楼里送 · 一键跑测试
# 用法:在 mall-delivery 目录下执行  .\run-tests.ps1
# 说明:优先用系统 PATH 里的 node;没有的话回退到 DSH 自带的 Node。

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$node = $null
$cmd = Get-Command node -ErrorAction SilentlyContinue
if ($cmd) { $node = $cmd.Source }

if (-not $node) {
  $fallback = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path $fallback) {
    $node = $fallback
    Write-Host "PATH 里没有 node,用 DSH 自带的:$fallback" -ForegroundColor DarkGray
  }
}

if (-not $node) {
  Write-Host "找不到 node。请装 Node.js,或直接用 DSH 里的 Node 运行:" -ForegroundColor Red
  Write-Host "  <node.exe 路径> test/core.test.js"
  exit 2
}

Write-Host ""
Write-Host "==== 1/2  逻辑层测试 ====" -ForegroundColor Cyan
& $node (Join-Path $here 'test\core.test.js')
$logic = $LASTEXITCODE

Write-Host ""
Write-Host "==== 2/2  界面冒烟测试 ====" -ForegroundColor Cyan
& $node (Join-Path $here 'test\smoke.js')
$smoke = $LASTEXITCODE

Write-Host ""
if ($logic -eq 0 -and $smoke -eq 0) {
  Write-Host "两套测试全部通过。" -ForegroundColor Green
  exit 0
} else {
  Write-Host "有测试失败:逻辑层=$logic,界面=$smoke" -ForegroundColor Red
  exit 1
}
