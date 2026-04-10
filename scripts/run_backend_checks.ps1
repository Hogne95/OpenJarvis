[CmdletBinding(PositionalBinding = $false)]
param(
    [string]$ProjectEnvironment = ".uv-win",
    [string]$PythonVersion = "3.12",
    [switch]$SkipSync,
    [switch]$SkipPytest,
    [switch]$RunRuff,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PytestArgs
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$projectEnvironmentPath = Join-Path $repoRoot $ProjectEnvironment
if (-not $PytestArgs -or $PytestArgs.Count -eq 0) {
    $PytestArgs = @("tests/", "-q")
}

$env:UV_PROJECT_ENVIRONMENT = $projectEnvironmentPath

Write-Host "OpenJarvis backend checks" -ForegroundColor Cyan
Write-Host "Root: $repoRoot"
Write-Host "uv project environment: $projectEnvironmentPath"
Write-Host "Preferred Python: $PythonVersion"
Write-Host ""

if (-not $SkipSync) {
    Write-Host "Syncing a Windows-managed environment for backend checks..." -ForegroundColor Yellow
    & uv sync --python $PythonVersion --extra server --extra dev
    if ($LASTEXITCODE -ne 0) {
        throw "uv sync failed."
    }
}

if ($RunRuff) {
    Write-Host "Running Ruff..." -ForegroundColor Yellow
    & uv run --python $PythonVersion ruff check src/ tests/
    if ($LASTEXITCODE -ne 0) {
        throw "ruff check failed."
    }
}

if (-not $SkipPytest) {
    Write-Host "Running pytest $($pytestArgs -join ' ')" -ForegroundColor Yellow
    & uv run --python $PythonVersion pytest @pytestArgs
    if ($LASTEXITCODE -ne 0) {
        throw "pytest failed."
    }
}

Write-Host ""
Write-Host "Backend checks completed successfully." -ForegroundColor Green
