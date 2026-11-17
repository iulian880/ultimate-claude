# uc <minimal|standard|strict> [claude args...]
# Starts Claude Code with the settings file of the chosen uc-core profile.
$ErrorActionPreference = 'Stop'

$profiles = @('minimal', 'standard', 'strict')
if ($args.Count -lt 1 -or $profiles -notcontains "$($args[0])".ToLowerInvariant()) {
    [Console]::Error.WriteLine('Usage: uc <minimal|standard|strict> [claude args...]')
    exit 1
}

$name = "$($args[0])".ToLowerInvariant()
$rest = @($args | Select-Object -Skip 1)
$root = Split-Path -Parent $PSScriptRoot
$settings = Join-Path $root (Join-Path 'plugins' (Join-Path 'uc-core' (Join-Path 'profiles' "$name.json")))

& claude --settings $settings @rest
exit $LASTEXITCODE
