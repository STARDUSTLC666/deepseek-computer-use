# Persistent helper harness: one process, many request/response round trips.
$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot 'bin\dsh-computer-use-helper.exe'
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $exe
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$proc = [System.Diagnostics.Process]::Start($psi)
$script:seq = 0
function Invoke-Cu([hashtable]$payload) {
    $script:seq++
    $payload['id'] = $script:seq
    $json = ($payload | ConvertTo-Json -Depth 14 -Compress)
    $proc.StandardInput.WriteLine($json)
    $proc.StandardInput.Flush()
    $line = $proc.StandardOutput.ReadLine()
    if (-not $line) { throw 'helper produced no response' }
    return $line | ConvertFrom-Json
}
function Stop-Cu { try { $proc.StandardInput.Close() } catch {}; try { $proc.Kill() } catch {} }