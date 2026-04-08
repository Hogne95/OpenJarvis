$ErrorActionPreference = "SilentlyContinue"

$repoRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$reportPath = Join-Path $repoRoot "desktop-readiness-report.txt"
$readinessScript = Join-Path $repoRoot "check_openjarvis_desktop.ps1"
$policyScript = Join-Path $repoRoot "check_openjarvis_desktop_policy.ps1"

$header = @(
  "OpenJarvis Desktop Report"
  "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
  "Machine: $env:COMPUTERNAME"
  "User: $env:USERNAME"
  ""
  "=== Desktop Readiness ==="
)

$readinessOutput = & powershell -ExecutionPolicy Bypass -File $readinessScript 2>&1 | Out-String
$policyHeader = @(
  ""
  "=== Desktop Policy Diagnostics ==="
)
$policyOutput = & powershell -ExecutionPolicy Bypass -File $policyScript 2>&1 | Out-String

($header + $readinessOutput + $policyHeader + $policyOutput) -join [Environment]::NewLine |
  Set-Content -Path $reportPath -Encoding UTF8

Write-Host "Desktop report written to: $reportPath" -ForegroundColor Green
