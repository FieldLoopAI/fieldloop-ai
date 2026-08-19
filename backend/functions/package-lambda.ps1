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
    'terminate-contractor', 'search-kb-entries', 'list-kb-trades',
    'list-invoices', 'list-estimates', 'update-estimate',
    'get-job-file', 'submit-kb-entry', 'list-my-kb-submissions',
    'get-platform-overview', 'list-platform-contractors',
    'list-kb-submissions-admin', 'review-kb-submission',
    'get-platform-contractor-usage',
    'list-vehicles', 'add-vehicle', 'update-vehicle',
    'list-customers', 'add-customer', 'update-customer'
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
