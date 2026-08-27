<#+
.SYNOPSIS
  Resolve a pnpm command even when the Windows PATH has no pnpm shim.

  Windows shortcuts often start with a minimal PATH. Prefer an installed pnpm
  executable, then fall back to Corepack (bundled with supported Node.js).
#>

function Resolve-PnpmCommand {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot
  )

  $pathCommands = @('pnpm.cmd', 'pnpm.exe', 'pnpm')
  foreach ($name in $pathCommands) {
    $command = Get-Command $name -ErrorAction SilentlyContinue |
      Where-Object { $_.Source -and (Test-Path -LiteralPath $_.Source) } |
      Select-Object -First 1
    if ($command) {
      return [PSCustomObject]@{
        Path          = $command.Source
        PrefixArguments = @()
        Source        = 'PATH'
      }
    }
  }

  $candidatePaths = @()
  if ($env:PNPM_HOME) {
    $candidatePaths += Join-Path $env:PNPM_HOME 'pnpm.cmd'
    $candidatePaths += Join-Path $env:PNPM_HOME 'pnpm.exe'
  }
  if ($env:LOCALAPPDATA) {
    $candidatePaths += Join-Path $env:LOCALAPPDATA 'pnpm\pnpm.cmd'
    $candidatePaths += Join-Path $env:LOCALAPPDATA 'pnpm\pnpm.exe'
  }
  if ($env:APPDATA) {
    $candidatePaths += Join-Path $env:APPDATA 'npm\pnpm.cmd'
    $candidatePaths += Join-Path $env:APPDATA 'npm\pnpm.exe'
  }
  if ($env:ProgramFiles) {
    $candidatePaths += Join-Path $env:ProgramFiles 'nodejs\pnpm.cmd'
    $candidatePaths += Join-Path $env:ProgramFiles 'nodejs\pnpm.exe'
  }
  if (${env:ProgramFiles(x86)}) {
    $candidatePaths += Join-Path ${env:ProgramFiles(x86)} 'nodejs\pnpm.cmd'
    $candidatePaths += Join-Path ${env:ProgramFiles(x86)} 'nodejs\pnpm.exe'
  }
  $candidatePaths += Join-Path $RepoRoot 'node_modules\.bin\pnpm.cmd'
  $candidatePaths += Join-Path $RepoRoot 'node_modules\.bin\pnpm.exe'

  foreach ($candidate in ($candidatePaths | Select-Object -Unique)) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return [PSCustomObject]@{
        Path            = (Resolve-Path -LiteralPath $candidate).Path
        PrefixArguments = @()
        Source          = 'installed'
      }
    }
  }

  $corepack = Get-Command corepack.cmd -ErrorAction SilentlyContinue |
    Where-Object { $_.Source -and (Test-Path -LiteralPath $_.Source) } |
    Select-Object -First 1
  if (-not $corepack -and $env:ProgramFiles) {
    $corepackPath = Join-Path $env:ProgramFiles 'nodejs\corepack.cmd'
    if (Test-Path -LiteralPath $corepackPath -PathType Leaf) {
      $corepack = [PSCustomObject]@{ Source = (Resolve-Path -LiteralPath $corepackPath).Path }
    }
  }
  if ($corepack) {
    return [PSCustomObject]@{
      Path            = $corepack.Source
      PrefixArguments = @('pnpm')
      Source          = 'Corepack'
    }
  }

  throw 'Khong tim thay pnpm. Hay cai Node.js 20+ (co Corepack) hoac cai pnpm, sau do mo lai launcher.'
}

function ConvertTo-PowerShellLiteral {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string]$Value)

  return "'$($Value.Replace("'", "''"))'"
}

function Get-PnpmPowerShellCommand {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)]$Pnpm)

  $pathLiteral = ConvertTo-PowerShellLiteral $Pnpm.Path
  $prefix = if ($Pnpm.PrefixArguments) {
    ($Pnpm.PrefixArguments | ForEach-Object { ConvertTo-PowerShellLiteral $_ }) -join ' '
  } else {
    ''
  }
  if ($prefix) {
    return "& $pathLiteral $prefix"
  }
  return "& $pathLiteral"
}
