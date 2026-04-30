param(
    [string]$Message = "chore: sync changes to GitHub"
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
    param(
        [string[]]$Arguments
    )

    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

$origin = & git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($origin)) {
    throw "Git remote 'origin' is not configured."
}

$branch = (& git branch --show-current).Trim()
if ([string]::IsNullOrWhiteSpace($branch)) {
    throw "Could not determine the current git branch."
}

$userName = (& git config user.name 2>$null).Trim()
$userEmail = (& git config user.email 2>$null).Trim()
if ([string]::IsNullOrWhiteSpace($userName) -or [string]::IsNullOrWhiteSpace($userEmail)) {
    throw "Git user.name and user.email must be configured before sync."
}

Invoke-Git @("add", "-A")

$status = & git status --porcelain
if ($LASTEXITCODE -ne 0) {
    throw "git status failed with exit code $LASTEXITCODE"
}

if ($status) {
    Invoke-Git @("commit", "-m", $Message)
} else {
    Write-Host "No uncommitted changes found. Skipping commit."
}

& git rev-parse --abbrev-ref --symbolic-full-name "@{u}" *> $null
if ($LASTEXITCODE -eq 0) {
    Invoke-Git @("push")
} else {
    Invoke-Git @("push", "-u", "origin", $branch)
}
