param(
  [Parameter(Mandatory = $true)]
  [ValidateSet(
    'create-contractor', 'save-contractor-financials', 'reveal-field',
    'get-contractor', 'save-contractor-draft', 'activate-contractor',
    'get-system-settings', 'save-system-settings',
    'export-contractor-pdf', 'create-contractor-portal-user',
    'list-contractors', 'add-technician', 'list-technicians',
    'list-jobs', 'create-job', 'assign-job',
    'update-technician', 'deactivate-technician',
    'voice-token', 'voice-extract',
    'resend-technician-setup', 'complete-technician-setup',
    'list-kb-entries', 'create-kb-entry', 'review-kb-entry',
    'terminate-contractor'
  )]
  [string]$FunctionName
)

$functionDirectory = Join-Path $PSScriptRoot $FunctionName
Push-Location $functionDirectory

try {
  # Lambda resolves dependencies from /var/task/node_modules, so they must be
  # installed in the individual function directory before zipping.
  npm install --omit=dev
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed for $FunctionName."
  }

  $zipPath = Join-Path $functionDirectory 'function.zip'
  Compress-Archive -Path index.js, shared, node_modules, package.json -DestinationPath $zipPath -Force
  Write-Host "Created $zipPath"
}
finally {
  Pop-Location
}
