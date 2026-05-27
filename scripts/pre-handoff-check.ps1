$ErrorActionPreference = "Stop"

$ignoredPrefixes = @(
    "claude_code/",
    "codex_code/",
    "gemini_code/"
)

function Invoke-Git {
    param(
        [string[]]$Arguments
    )

    $output = & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }

    if ($null -eq $output) {
        return @()
    }

    if ($output -is [System.Array]) {
        return $output
    }

    return @("$output")
}

function Normalize-Path {
    param(
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return ""
    }

    $normalized = $Path.Replace("\", "/").Trim()
    return $normalized.Trim('"')
}

function Is-IgnoredPath {
    param(
        [string]$Path
    )

    $normalized = Normalize-Path -Path $Path
    foreach ($prefix in $ignoredPrefixes) {
        if ($normalized.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }

    return $false
}

function Select-NonIgnoredPaths {
    param(
        [string[]]$Paths
    )

    $filtered = @()
    foreach ($path in $Paths) {
        $normalized = Normalize-Path -Path $path
        if ($normalized -and -not (Is-IgnoredPath -Path $normalized)) {
            $filtered += $normalized
        }
    }

    return $filtered | Sort-Object -Unique
}

function Add-Error {
    param(
        [System.Collections.Generic.List[string]]$Errors,
        [string]$Message
    )

    $null = $Errors.Add($Message)
}

$errors = [System.Collections.Generic.List[string]]::new()

try {
    $null = Invoke-Git -Arguments @("rev-parse", "--show-toplevel")
} catch {
    throw "Not inside a git repository."
}

$trackedIgnored = Invoke-Git -Arguments @("ls-files", "claude_code", "codex_code", "gemini_code")
if ($trackedIgnored.Count -gt 0) {
    Add-Error -Errors $errors -Message "Tracked files exist in ignored folders. Remove them from git tracking: git rm --cached -r claude_code codex_code gemini_code"
}

$mergeConflictsRaw = Invoke-Git -Arguments @("ls-files", "-u")
if ($mergeConflictsRaw.Count -gt 0) {
    Add-Error -Errors $errors -Message "Merge conflicts are unresolved. Resolve conflicts and re-run the check."
}

$unstaged = Select-NonIgnoredPaths -Paths (Invoke-Git -Arguments @("diff", "--name-only"))
$staged = Select-NonIgnoredPaths -Paths (Invoke-Git -Arguments @("diff", "--cached", "--name-only"))
$untracked = Select-NonIgnoredPaths -Paths (Invoke-Git -Arguments @("ls-files", "--others", "--exclude-standard"))

if ($unstaged.Count -gt 0) {
    Add-Error -Errors $errors -Message ("Unstaged tracked changes: " + ($unstaged -join ", "))
}

if ($staged.Count -gt 0) {
    Add-Error -Errors $errors -Message ("Staged but uncommitted changes: " + ($staged -join ", "))
}

if ($untracked.Count -gt 0) {
    Add-Error -Errors $errors -Message ("Untracked files outside ignored folders: " + ($untracked -join ", "))
}

$upstream = (& git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($upstream)) {
    Add-Error -Errors $errors -Message "No upstream branch configured. Set upstream first: git push -u origin <branch>"
} else {
    $behindRaw = Invoke-Git -Arguments @("rev-list", "--count", "HEAD..@{u}")
    $aheadRaw = Invoke-Git -Arguments @("rev-list", "--count", "@{u}..HEAD")
    $behindCount = [int]([string]($behindRaw | Select-Object -First 1)).Trim()
    $aheadCount = [int]([string]($aheadRaw | Select-Object -First 1)).Trim()

    if ($behindCount -gt 0) {
        Add-Error -Errors $errors -Message "Local branch is behind upstream by $behindCount commit(s). Run: git pull --rebase"
    }

    if ($aheadCount -gt 0) {
        Add-Error -Errors $errors -Message "Local branch is ahead of upstream by $aheadCount commit(s). Run: git push"
    }
}

$inProgressJson = & bd list --status=in_progress --json 2>$null
if ($LASTEXITCODE -ne 0) {
    Add-Error -Errors $errors -Message "Could not query bd in-progress issues. Verify beads is installed and workspace is initialized."
} else {
    $inProgressIssues = @()
    if (-not [string]::IsNullOrWhiteSpace($inProgressJson)) {
        $parsed = $inProgressJson | ConvertFrom-Json
        if ($parsed -is [System.Array]) {
            $inProgressIssues = $parsed
        } elseif ($null -ne $parsed) {
            $inProgressIssues = @($parsed)
        }
    }

    if ($inProgressIssues.Count -gt 0) {
        $issueIds = ($inProgressIssues | ForEach-Object { $_.id }) -join ", "
        Add-Error -Errors $errors -Message "bd still has in-progress issue(s): $issueIds. Close or update them before handoff."
    }
}

if ($errors.Count -gt 0) {
    Write-Host "Pre-handoff check: FAILED" -ForegroundColor Red
    foreach ($errorMessage in $errors) {
        Write-Host ("- " + $errorMessage) -ForegroundColor Red
    }
    exit 1
}

Write-Host "Pre-handoff check: PASSED" -ForegroundColor Green
Write-Host "No pending git or bd blockers outside ignored folders."
