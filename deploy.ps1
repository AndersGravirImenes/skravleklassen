# Deploy skravleklassen.no til GitHub Pages
# Kjør i PowerShell fra denne mappen: .\deploy.ps1

$ErrorActionPreference = "Stop"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

Set-Location $PSScriptRoot

Write-Host "Sjekker GitHub-innlogging..." -ForegroundColor Cyan
gh auth status
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nDu må logge inn først. Kjør:" -ForegroundColor Yellow
    Write-Host "  gh auth login -s repo,workflow" -ForegroundColor Yellow
    exit 1
}

Write-Host "Kobler git til GitHub CLI..." -ForegroundColor Cyan
gh auth setup-git

$repoName = "skravleklassen"
$hasOrigin = (git remote) -contains "origin"

if (-not $hasOrigin) {
    Write-Host "Oppretter repo på GitHub..." -ForegroundColor Cyan
    gh repo create $repoName --public --source=. --remote=origin
}

Write-Host "Pusher kode til GitHub..." -ForegroundColor Cyan
git push -u origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nPush feilet (ofte manglende rettigheter på token)." -ForegroundColor Red
    Write-Host "Kjør dette, godkjenn i nettleseren, og kjør deploy.ps1 på nytt:" -ForegroundColor Yellow
    Write-Host "  gh auth refresh -h github.com -s repo,workflow" -ForegroundColor Yellow
    exit 1
}

$user = (gh api user --jq .login)
Write-Host "`nAktiverer GitHub Pages..." -ForegroundColor Cyan
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
gh api -X POST "/repos/$user/$repoName/pages" -f "source[branch]=main" -f "source[path]=/" -f "cname=www.skravleklassen.no" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    gh api -X PUT "/repos/$user/$repoName/pages" -f "source[branch]=main" -f "source[path]=/" -f "cname=www.skravleklassen.no" 2>$null | Out-Null
}
$ErrorActionPreference = $prevEAP
if ($LASTEXITCODE -ne 0) {
    Write-Host "Pages-API feilet – aktiver manuelt (tar 1 min):" -ForegroundColor Yellow
    Write-Host "  https://github.com/$user/$repoName/settings/pages" -ForegroundColor Yellow
    Write-Host "  Branch: main, mappe: / (root), Custom domain: www.skravleklassen.no" -ForegroundColor Yellow
}

Write-Host "`nFerdig!" -ForegroundColor Green
Write-Host "Repo: https://github.com/$user/$repoName"
Write-Host "Pages (midlertidig): https://$user.github.io/$repoName/"
Write-Host "`nDNS hos domeneleverandør (for www.skravleklassen.no):"
Write-Host "  Type: CNAME"
Write-Host "  Navn: www"
Write-Host "  Verdi: $user.github.io"
Write-Host "`nVent 5-60 min etter DNS-endring. Aktiver HTTPS under Settings > Pages på GitHub."
