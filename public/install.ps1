# WaveFunc Radio Terminal UI (wf) installer for Windows
# Usage: irm https://wavefunc.live/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo = if ($env:WF_REPO) { $env:WF_REPO } else { "zeSchlausKwab/wavefunc" }
$BinName = "wf.exe"

function Resolve-Version {
    if ($env:WF_VERSION) {
        return $env:WF_VERSION.TrimStart("v")
    }
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "WaveFunc-Installer" }
    if (-not $release.tag_name) {
        throw "Could not determine latest release tag from GitHub."
    }
    return $release.tag_name.TrimStart("v")
}

$Version = Resolve-Version
$Tag = "v$Version"
$Archive = "wf_${Version}_windows_amd64.zip"
$BaseUrl = "https://github.com/$Repo/releases/download/$Tag"

$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("wf-install-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

try {
    Write-Host "((o)) Installing WaveFunc Terminal (wf $Tag) for windows/amd64..." -ForegroundColor Cyan

    $ZipPath = Join-Path $TmpDir $Archive
    Invoke-WebRequest -Uri "$BaseUrl/$Archive" -OutFile $ZipPath -UseBasicParsing

    # Verify SHA-256 checksum when wf_checksums.txt is available.
    $ChecksumsPath = Join-Path $TmpDir "wf_checksums.txt"
    try {
        Invoke-WebRequest -Uri "$BaseUrl/wf_checksums.txt" -OutFile $ChecksumsPath -UseBasicParsing
        $ExpectedLine = Get-Content $ChecksumsPath | Where-Object { $_ -match "\s$([regex]::Escape($Archive))$" } | Select-Object -First 1
        if ($ExpectedLine) {
            $Expected = ($ExpectedLine -split "\s+")[0].ToLowerInvariant()
            $Actual = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($Actual -ne $Expected) {
                throw "Checksum mismatch for $Archive (expected $Expected, got $Actual)"
            }
            Write-Host "  [ok] SHA-256 verified" -ForegroundColor Green
        }
    } catch {
        if ($_.Exception.Message -like "Checksum mismatch*") { throw }
    }

    $ExtractDir = Join-Path $TmpDir "extract"
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force

    $SourceBin = Join-Path $ExtractDir $BinName
    if (-not (Test-Path $SourceBin)) {
        throw "Archive did not contain $BinName"
    }

    $InstallDir = if ($env:WF_INSTALL_DIR) { $env:WF_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "wavefunc\bin" }
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

    $TargetBin = Join-Path $InstallDir $BinName
    Move-Item -Path $SourceBin -Destination $TargetBin -Force
    Write-Host "  [ok] Installed to $TargetBin" -ForegroundColor Green

    # Ensure InstallDir is on the user's PATH.
    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $PathParts = if ($UserPath) { $UserPath -split ";" } else { @() }
    if ($PathParts -notcontains $InstallDir) {
        $NewPath = if ($UserPath) { "$UserPath;$InstallDir" } else { $InstallDir }
        [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
        $env:Path = "$env:Path;$InstallDir"
        Write-Host "  [ok] Added $InstallDir to your User PATH (restart terminal if needed)" -ForegroundColor Yellow
    }

    Write-Host ""
    if (Get-Command mpv -ErrorAction SilentlyContinue) {
        Write-Host "  [ok] Audio backend ready: mpv" -ForegroundColor Green
    } elseif (Get-Command ffplay -ErrorAction SilentlyContinue) {
        Write-Host "  [ok] Audio backend ready: ffplay (tip: install mpv for instant live volume/pause)" -ForegroundColor Green
    } elseif (Get-Command vlc -ErrorAction SilentlyContinue) {
        Write-Host "  [ok] Audio backend ready: vlc" -ForegroundColor Green
    } else {
        Write-Host "  [!] No audio backend found yet. Install mpv to start listening:" -ForegroundColor Yellow
        Write-Host "      winget install mpv" -ForegroundColor White
    }

    Write-Host ""
    Write-Host "  Run 'wf' to tune in — or 'wf --lucky' for instant radio!" -ForegroundColor Cyan
} finally {
    Remove-Item -Path $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
