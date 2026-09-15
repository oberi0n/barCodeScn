[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$mkcert = Get-Command mkcert -ErrorAction SilentlyContinue
if (-not $mkcert) {
    Write-Error @'
mkcert is not installed or is not available in PATH.
Install it first (for example with "winget install FiloSottile.mkcert" or "choco install mkcert"),
then run "mkcert -install" before running this script again.
'@
    exit 1
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$certificateDirectory = Join-Path $repositoryRoot 'certs'
$certificatePath = Join-Path $certificateDirectory 'barscan.pem'
$privateKeyPath = Join-Path $certificateDirectory 'barscan-key.pem'

New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null

try {
    Push-Location $repositoryRoot
    & $mkcert.Source `
        -cert-file certs/barscan.pem `
        -key-file certs/barscan-key.pem `
        192.168.1.186 localhost 127.0.0.1

    if ($LASTEXITCODE -ne 0) {
        throw "mkcert failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

$certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($certificatePath)
$sanExtension = $certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.17' }
$sanText = if ($sanExtension) { $sanExtension.Format($true) } else { '' }
if ($sanText -notmatch '192\.168\.1\.186') {
    throw 'Certificate verification failed: 192.168.1.186 is missing from Subject Alternative Names.'
}

Write-Host "`nCertificate created and SAN verified:" -ForegroundColor Green
Write-Host "  $certificatePath"
Write-Host "  $privateKeyPath"
Write-Host "`nmkcert CA directory:"
& $mkcert.Source -CAROOT
Write-Host 'Copy only rootCA.pem to the iPhone. Never copy or install rootCA-key.pem.' -ForegroundColor Yellow

$port443InUse = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue
if ($port443InUse) {
    Write-Warning 'Port 443 is already in use. Before docker compose up, set $env:HTTPS_PORT=8443 and use https://192.168.1.186:8443 instead.'
}
