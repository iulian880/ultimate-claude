# uc <minimal|standard|strict> [claude args...]
# Starts Claude Code with the settings file of the chosen uc-core profile.
$ErrorActionPreference = 'Stop'

if ($args.Count -gt 0 -and $args[0] -in @('verify','status')) {
    & node (Join-Path (Split-Path -Parent $PSScriptRoot) 'plugins/uc-core/hooks/cli.mjs') @args
    exit $LASTEXITCODE
}

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
