# 楼里送 · 一键跑测试
# 用法:在 mall-delivery 目录下执行  .\run-tests.ps1
# 说明:优先用系统 PATH 里的 node;没有的话回退到 DSH 自带的 Node。
# 如果双击报"在此系统上禁止运行脚本",改用 run-tests.cmd。

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

$suites = @(
  @{ n = '1/4  HTML 标签嵌套';   f = 'test\check-html.js' },
  @{ n = '2/4  逻辑层';          f = 'test\core.test.js' },
  @{ n = '3/4  布局 / CSS 回归'; f = 'test\layout.test.js' },
  @{ n = '4/4  界面冒烟';        f = 'test\smoke.js' }
)

$failed = @()
foreach ($s in $suites) {
  Write-Host ""
  Write-Host ("==== " + $s.n + " ====") -ForegroundColor Cyan
  & $node (Join-Path $here $s.f)
  if ($LASTEXITCODE -ne 0) { $failed += $s.n }
}

Write-Host ""
if ($failed.Count -eq 0) {
  Write-Host "四套测试全部通过。" -ForegroundColor Green
  exit 0
} else {
  Write-Host ("有测试失败:" + ($failed -join ' / ')) -ForegroundColor Red
  exit 1
}
