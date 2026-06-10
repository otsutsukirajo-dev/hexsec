# ═══════════════════════════════════════════════════════════════════════════
#  PointagePro — Script de Build Windows Propre
#  build-win.ps1 — PowerShell 5.1+
#  Usage : .\build-win.ps1
# ═══════════════════════════════════════════════════════════════════════════

param(
    [switch]$SkipClean = $false,
    [switch]$DirOnly   = $false
)

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "PointagePro — Build Windows"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     PointagePro — Script de Build Windows        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ─── ÉTAPE 1 : Fermeture de tous les processus Electron/PointagePro ─────────
Write-Host "[1/4] Fermeture des processus en cours..." -ForegroundColor Yellow

$processNames = @("PointagePro", "electron", "electron.exe")

foreach ($procName in $processNames) {
    try {
        $procs = Get-Process -Name $procName -ErrorAction SilentlyContinue
        if ($procs) {
            $procs | ForEach-Object {
                Write-Host "  → Arrêt de : $($_.Name) (PID $($_.Id))" -ForegroundColor DarkYellow
                $_ | Stop-Process -Force
            }
            Start-Sleep -Milliseconds 800
        }
    } catch {
        # Processus déjà arrêté — on continue
    }
}

# Attente supplémentaire pour que Windows libère les verrous fichiers
Start-Sleep -Seconds 2
Write-Host "  ✓ Tous les processus Electron sont arrêtés" -ForegroundColor Green

# ─── ÉTAPE 2 : Nettoyage du dossier dist ─────────────────────────────────────
if (-not $SkipClean) {
    Write-Host ""
    Write-Host "[2/4] Nettoyage du dossier 'dist'..." -ForegroundColor Yellow

    if (Test-Path "dist") {
        # Tente la suppression normale
        try {
            Remove-Item -Path "dist" -Recurse -Force -ErrorAction Stop
            Write-Host "  ✓ Dossier 'dist' supprimé" -ForegroundColor Green
        } catch {
            Write-Host "  ⚠ Suppression partielle — tentative avec robocopy..." -ForegroundColor DarkYellow

            # Technique robuste : synchroniser avec un dossier vide pour contourner les verrous
            $emptyDir = [System.IO.Path]::GetTempPath() + "empty_" + [System.Guid]::NewGuid().ToString()
            New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null

            try {
                & robocopy $emptyDir "dist" /MIR /R:2 /W:1 | Out-Null
                Remove-Item -Path "dist" -Recurse -Force -ErrorAction SilentlyContinue
                Remove-Item -Path $emptyDir -Recurse -Force -ErrorAction SilentlyContinue
                Write-Host "  ✓ Dossier 'dist' nettoyé via robocopy" -ForegroundColor Green
            } catch {
                Write-Host "  ✗ Impossible de supprimer 'dist'. Tentative de build quand même..." -ForegroundColor Red
                Remove-Item -Path $emptyDir -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    } else {
        Write-Host "  ✓ Pas de dossier 'dist' existant" -ForegroundColor DarkGray
    }
} else {
    Write-Host ""
    Write-Host "[2/4] Nettoyage ignoré (-SkipClean)" -ForegroundColor DarkGray
}

# ─── ÉTAPE 3 : Vérification des prérequis ─────────────────────────────────────
Write-Host ""
Write-Host "[3/4] Vérification des prérequis..." -ForegroundColor Yellow

if (-not (Test-Path "node_modules")) {
    Write-Host "  ⚠ node_modules manquant — installation en cours..." -ForegroundColor DarkYellow
    & npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ npm install a échoué" -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path "electron.js")) {
    Write-Host "  ✗ electron.js introuvable dans le répertoire courant" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "index.html")) {
    Write-Host "  ✗ index.html introuvable dans le répertoire courant" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ Tous les prérequis sont présents" -ForegroundColor Green

# ─── ÉTAPE 4 : Lancement du Build ─────────────────────────────────────────────
Write-Host ""
if ($DirOnly) {
    Write-Host "[4/4] Build en cours (mode --dir, sans installeur)..." -ForegroundColor Yellow
    $buildCmd = "npx electron-builder --win --dir"
} else {
    Write-Host "[4/4] Build en cours (NSIS + Portable)..." -ForegroundColor Yellow
    $buildCmd = "npx electron-builder --win --x64"
}

Write-Host "  Commande : $buildCmd" -ForegroundColor DarkGray
Write-Host ""

try {
    Invoke-Expression $buildCmd
    $buildResult = $LASTEXITCODE
} catch {
    Write-Host ""
    Write-Host "  ✗ Erreur lors du build : $_" -ForegroundColor Red
    exit 1
}

# ─── RÉSULTAT ─────────────────────────────────────────────────────────────────
Write-Host ""
if ($buildResult -eq 0) {
    Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║     ✓ BUILD TERMINÉ AVEC SUCCÈS !                ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "Fichiers générés dans le dossier 'dist\' :" -ForegroundColor Cyan

    if (Test-Path "dist") {
        Get-ChildItem -Path "dist" -Filter "*.exe" | ForEach-Object {
            $sizeMB = [Math]::Round($_.Length / 1MB, 1)
            Write-Host "  📦 $($_.Name) ($sizeMB MB)" -ForegroundColor White
        }
    }
} else {
    Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "║     ✗ LE BUILD A ÉCHOUÉ                          ║" -ForegroundColor Red
    Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Red
    Write-Host ""
    Write-Host "Consultez les logs ci-dessus pour diagnostiquer l'erreur." -ForegroundColor Yellow
    exit 1
}
