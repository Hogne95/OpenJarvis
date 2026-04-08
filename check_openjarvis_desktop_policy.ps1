$ErrorActionPreference = "SilentlyContinue"

function Write-Section($title) {
  Write-Host ""
  Write-Host "== $title ==" -ForegroundColor Cyan
}

function Get-SmartAppControlState {
  $path = "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy"
  $value = Get-ItemProperty -Path $path -Name "VerifiedAndReputablePolicyState" -ErrorAction SilentlyContinue
  $state = $value.VerifiedAndReputablePolicyState
  $label = switch ($state) {
    0 { "Off" }
    1 { "Evaluation" }
    2 { "On" }
    default { if ($null -eq $state) { "Unknown" } else { "Unknown ($state)" } }
  }

  [PSCustomObject]@{
    State = $label
    RawValue = $state
  }
}

function Get-ServiceState($name) {
  $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
  if (-not $svc) {
    return [PSCustomObject]@{
      Name = $name
      Present = $false
      Status = ""
      StartType = ""
    }
  }

  $cim = Get-CimInstance Win32_Service -Filter "Name='$name'" -ErrorAction SilentlyContinue
  [PSCustomObject]@{
    Name = $name
    Present = $true
    Status = $svc.Status
    StartType = $cim.StartMode
  }
}

function Get-PolicyEventSummary($logName, $ids, $maxEvents = 5) {
  $events = Get-WinEvent -LogName $logName -MaxEvents 50 -ErrorAction SilentlyContinue |
    Where-Object { $ids -contains $_.Id } |
    Select-Object -First $maxEvents

  [PSCustomObject]@{
    LogName = $logName
    EventCount = @($events).Count
    Events = @($events | ForEach-Object {
      [PSCustomObject]@{
        TimeCreated = $_.TimeCreated
        Id = $_.Id
        Message = (($_.Message -replace '\s+', ' ').Trim())
      }
    })
  }
}

function Test-WdacPolicyFiles {
  $paths = @(
    "C:\Windows\System32\CodeIntegrity\CiPolicies\Active",
    "C:\Windows\System32\CodeIntegrity\CiPolicies\Staged"
  )

  $found = foreach ($path in $paths) {
    if (Test-Path $path) {
      Get-ChildItem -Path $path -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
    }
  }

  [PSCustomObject]@{
    PolicyFileCount = @($found).Count
    PolicyFiles = @($found | Select-Object -First 10)
  }
}

Write-Section "OpenJarvis Desktop Policy Diagnostics"

Write-Section "Smart App Control"
$smartAppControl = Get-SmartAppControlState
$smartAppControl | Format-List

Write-Section "Relevant Services"
$services = @("AppIDSvc", "AppLockerFltr", "WdNisSvc", "WinDefend") | ForEach-Object { Get-ServiceState $_ }
$services | Format-Table Name, Present, Status, StartType -AutoSize

Write-Section "WDAC Policy Files"
$wdac = Test-WdacPolicyFiles
$wdac | Select-Object PolicyFileCount | Format-List
if ($wdac.PolicyFiles.Count -gt 0) {
  Write-Host "Example policy files:" -ForegroundColor Yellow
  $wdac.PolicyFiles | ForEach-Object { Write-Host "  $_" }
}

Write-Section "Code Integrity Events"
$ci = Get-PolicyEventSummary -logName "Microsoft-Windows-CodeIntegrity/Operational" -ids @(3033, 3034, 3076, 3077, 3089)
$ci | Select-Object LogName, EventCount | Format-List
if ($ci.Events.Count -gt 0) {
  $ci.Events | Select-Object TimeCreated, Id, Message | Format-Table -Wrap -AutoSize
}

Write-Section "AppLocker Events"
$appLocker = Get-PolicyEventSummary -logName "Microsoft-Windows-AppLocker/EXE and DLL" -ids @(8003, 8004, 8006, 8007)
$appLocker | Select-Object LogName, EventCount | Format-List
if ($appLocker.Events.Count -gt 0) {
  $appLocker.Events | Select-Object TimeCreated, Id, Message | Format-Table -Wrap -AutoSize
}

Write-Section "Suggested Interpretation"
if ($smartAppControl.State -eq "On") {
  Write-Host "Smart App Control is enabled. Unsigned/generated Rust build helpers may be blocked." -ForegroundColor Yellow
} elseif ($wdac.PolicyFileCount -gt 0) {
  Write-Host "WDAC policy files are present. Device policy may be enforcing code execution restrictions." -ForegroundColor Yellow
} elseif ($appLocker.EventCount -gt 0) {
  Write-Host "AppLocker events were found. AppLocker may be controlling executable launch policy." -ForegroundColor Yellow
} elseif ($ci.EventCount -gt 0) {
  Write-Host "Code Integrity events were found. Review the messages above for blocked executable details." -ForegroundColor Yellow
} else {
  Write-Host "No strong policy signal was detected from this script. If Tauri still fails with os error 4551, run this checker as Administrator and inspect Windows Security / Event Viewer."
}
