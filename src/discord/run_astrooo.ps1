param([switch]$SyncCommands, [switch]$ResetCommands)
$ErrorActionPreference = 'Stop'
$astroDir = $PSScriptRoot
$astroPython = Join-Path $astroDir '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $astroPython)) {
    throw 'AstroOo virtual environment is missing. Run: py -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt'
}
$astroArgs = @()
if ($ResetCommands) { $astroArgs += '--reset-commands' }
elseif ($SyncCommands) { $astroArgs += '--sync-commands' }
& $astroPython (Join-Path $astroDir 'bot.py') @astroArgs
