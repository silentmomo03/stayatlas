param(
    [ValidateSet('All','Resources','Workflows','Publish','Verify')][string]$Stage = 'All',
    [ValidatePattern('^[a-z0-9]+$')][string]$Location = 'francecentral',
    [string]$SubscriptionId,
    [switch]$Apply
)
. (Join-Path $PSScriptRoot 'Azure-Common.ps1')
. (Join-Path $PSScriptRoot 'Connection-Template.ps1')
$projectRoot = Get-ProjectRoot
$resourceGroup = 'stayatlas-coursework'
$deploymentName = 'stayatlas-resources'
$cloudDirectory = Join-Path $projectRoot '.local/cloud'
$functionZip = Join-Path $projectRoot 'StayAtlas_Function.zip'

$subscriptions = @(Invoke-AzJson -Arguments @('account','list'))
$students = @($subscriptions | Where-Object {
    $_.state -eq 'Enabled' -and $_.name -eq 'Azure for Students' -and
    (-not $SubscriptionId -or $_.id -eq $SubscriptionId)
})
if ($students.Count -ne 1) {
    throw 'Expected one enabled Azure for Students subscription. Check az account list and, if there is more than one, pass the intended -SubscriptionId.'
}
$SubscriptionId = $students[0].id
Write-Host ('Target: Azure for Students / '+$resourceGroup+' / requested region '+$Location+' / Translator F0.')
if (-not $Apply) {
    Write-Host 'Review the target. Run with -Apply to execute the requested stage.'
    return
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required in Cloud Shell.' }
if ($Stage -in @('All','Publish')) {
    foreach ($file in @('StayAtlas_Function.zip','dist/index.html','dist/app.js','dist/config.js','dist/data/index.json',
                        'dist/vendor/pdf.mjs','dist/vendor/pdf.worker.mjs')) {
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $file) -PathType Leaf)) {
            throw ('Missing '+$file+'. Extract the complete StayAtlas Cloud Shell package.')
        }
    }
}
$null = Invoke-AzJson -Arguments @('account','set','--subscription',$SubscriptionId)
Assert-CloudAccount ([pscustomobject]@{subscriptionId=$SubscriptionId})

# Recover the named ARM deployment after a partial run or a Cloud Shell restart.
$groupExists = Invoke-AzJson -Arguments @('group','exists','--name',$resourceGroup)
$previousState = if ($groupExists) {
    Invoke-AzJson -Arguments @('deployment','group','list','--resource-group',$resourceGroup,
        '--query',("[?name=='"+$deploymentName+"'].properties.provisioningState | [0]"))
}
if ($previousState -eq 'Succeeded') {
    $deployment = Invoke-AzJson -Arguments @('deployment','group','show','--resource-group',$resourceGroup,'--name',$deploymentName)
    $recovered = [ordered]@{subscriptionId=$SubscriptionId;resourceGroup=$resourceGroup}
    foreach ($field in @('storageName','cosmosName','functionName','translatorName','workflowPrefix','apiOrigin')) {
        $value = Get-ConnectionField (Get-ConnectionField $deployment.properties.outputs $field) 'value'
        if (-not $value) { throw ('StayAtlas ARM deployment output is missing: '+$field) }
        $recovered[$field] = $value
    }
    $storage = Invoke-AzJson -Arguments @('storage','account','show','--resource-group',$resourceGroup,'--name',$recovered.storageName)
    $recovered.location = $storage.location
    Write-PrivateJson -Path (Join-Path $cloudDirectory 'resources.json') -Value $recovered
    Write-Host ('Reusing the successful StayAtlas resource deployment in '+$recovered.location+'.')
} elseif ($Stage -in @('All','Resources')) {
    if ($previousState -in @('Accepted','Running')) { throw 'A StayAtlas ARM deployment is still running. Check it in Azure before retrying.' }
    Write-Host 'Validating and deploying the resource template with Flex Consumption (FC1)...'
    & (Join-Path $PSScriptRoot 'Deploy-Resources.ps1') -ResourceGroup $resourceGroup -Location $Location -TranslatorSku F0 -Apply
} else {
    throw 'Run the Resources stage first. No successful StayAtlas ARM deployment was found.'
}
$state = Read-CloudState
Assert-CloudAccount $state
if ($state.resourceGroup -ne $resourceGroup -or $state.workflowPrefix -notmatch '^stayatlas-[a-z0-9]+$') {
    throw 'Saved resource details do not match StayAtlas.'
}
if ($Stage -eq 'Resources') { return }

$operations = @('iups','rai','rips','uips','dips','fips')
$workflows = @()
$connectionStates = @()
if ($Stage -in @('All','Workflows')) {
    $provider = Invoke-AzJson -Arguments @('provider','show','--namespace','Microsoft.Logic')
    if ($provider.registrationState -ne 'Registered') {
        Write-Host 'Registering Microsoft.Logic in the selected student subscription...'
        $null = Invoke-AzJson -Arguments @('provider','register','--namespace','Microsoft.Logic','--wait')
    }
    $metadata = @{}
    foreach ($connector in @('azureblob','documentdb')) {
        $uri = '/subscriptions/{0}/providers/Microsoft.Web/locations/{1}/managedApis/{2}?api-version=2016-06-01' -f $SubscriptionId,$state.location,$connector
        $metadata[$connector] = Invoke-AzJson -Arguments @('rest','--method','get','--url',$uri)
    }
    $blobName = $state.workflowPrefix+'-blob'
    $cosmosName = $state.workflowPrefix+'-cosmos'
    $template = New-StayAtlasConnectionTemplate -State $state -BlobMetadata $metadata.azureblob -CosmosMetadata $metadata.documentdb
    $templatePath = Join-Path $cloudDirectory 'connections.generated.json'
    Write-PrivateJson -Path $templatePath -Value $template
    & (Join-Path $PSScriptRoot 'Configure-Workflows.ps1') -BlobConnectionName $blobName -CosmosConnectionName $cosmosName -PrepareOnly
    $null = Invoke-AzJson -Arguments @('deployment','group','validate','--resource-group',$resourceGroup,'--template-file',$templatePath)
    Write-Host 'Deploying Blob Storage and Cosmos DB connections...'
    $null = Invoke-AzJson -Arguments @('deployment','group','create','--resource-group',$resourceGroup,'--name','stayatlas-connections','--template-file',$templatePath)
    foreach ($name in @($blobName,$cosmosName)) {
        $id = '/subscriptions/{0}/resourceGroups/{1}/providers/Microsoft.Web/connections/{2}' -f $SubscriptionId,$resourceGroup,$name
        for ($attempt = 0; $attempt -lt 12; $attempt++) {
            $connection = Invoke-AzJson -Arguments @('rest','--method','get','--url',($id+'?api-version=2016-06-01'))
            $statuses = @((Get-ConnectionField $connection.properties 'statuses') | ForEach-Object { Get-ConnectionField $_ 'status' })
            if ($statuses -contains 'Connected') { break }
            if ($attempt -lt 11) { Start-Sleep -Seconds 3 }
        }
        if ($statuses -notcontains 'Connected') { throw ('Connection did not reach Connected: '+$name) }
        $connectionStates += [ordered]@{name=$name;status='Connected'}
    }
    Write-Host 'Deploying six Logic Apps workflows...'
    $workflowPath = Join-Path $cloudDirectory 'workflows.generated.json'
    $null = Invoke-AzJson -Arguments @('deployment','group','validate','--resource-group',$resourceGroup,'--template-file',$workflowPath)
    $null = Invoke-AzJson -Arguments @('deployment','group','create','--resource-group',$resourceGroup,'--name','stayatlas-workflows','--template-file',$workflowPath)
    foreach ($operation in $operations) {
        $name = $state.workflowPrefix+'-'+$operation
        $id = '/subscriptions/{0}/resourceGroups/{1}/providers/Microsoft.Logic/workflows/{2}' -f $SubscriptionId,$resourceGroup,$name
        $workflow = Invoke-AzJson -Arguments @('rest','--method','get','--url',($id+'?api-version=2019-05-01'))
        if ($workflow.properties.provisioningState -ne 'Succeeded' -or $workflow.properties.state -ne 'Enabled') {
            throw ('Workflow is not ready: '+$name)
        }
        $workflows += [ordered]@{name=$name;state='Enabled';provisioningState='Succeeded'}
    }
    Write-Host 'Verified two connected connectors and six enabled workflows.'
}
if ($Stage -eq 'Workflows') { return }

if ($Stage -in @('All','Publish')) {
    Write-Host 'Publishing the Function and static website...'
    & (Join-Path $PSScriptRoot 'Publish-Application.ps1') -FunctionZip $functionZip -SkipBuild -Apply
}
if ($Stage -eq 'Publish') { return }

$siteOrigin = (Invoke-AzJson -Arguments @('storage','account','show','--resource-group',$resourceGroup,'--name',$state.storageName)).primaryEndpoints.web.TrimEnd('/')
$apiOrigin = $state.apiOrigin.TrimEnd('/')
$health = $null
Write-Host 'Waiting for the Azure Function health endpoint...'
for ($attempt = 0; $attempt -lt 12; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri ($apiOrigin+'/api/health') -TimeoutSec 15
        if ($health.status -eq 'ok' -and $health.mode -eq 'azure') { break }
    } catch { }
    if ($attempt -lt 11) { Start-Sleep -Seconds 5 }
}
if (-not $health -or $health.status -ne 'ok' -or $health.mode -ne 'azure') { throw 'Azure Function health did not become ready. Check the Function deployment status.' }

$index = Invoke-WebRequest -Uri ($siteOrigin+'/index.html') -TimeoutSec 30
if ($index.StatusCode -ne 200 -or $index.Content -notmatch 'StayAtlas') { throw 'The published site did not return the StayAtlas page.' }
$siteConfig = Invoke-WebRequest -Uri ($siteOrigin+'/config.js') -TimeoutSec 30
if ($siteConfig.StatusCode -ne 200 -or -not $siteConfig.Content.Contains($apiOrigin)) { throw 'The website API URL does not match the deployed Function.' }
$reference = Invoke-RestMethod -Uri ($siteOrigin+'/data/index.json') -TimeoutSec 30
if ($reference.listingCount -ne 1000 -or $reference.reviewCount -ne 13130) { throw 'The published site is missing its reference dataset.' }
foreach ($module in @('pdf.mjs','pdf.worker.mjs')) {
    $response = Invoke-WebRequest -Uri ($siteOrigin+'/vendor/'+$module) -Method Head -TimeoutSec 30
    if ($response.StatusCode -ne 200 -or ($response.Headers['Content-Type'] -join ',') -notmatch 'javascript|ecmascript') {
        throw ('The website did not serve '+$module+' as JavaScript.')
    }
}
$preflight = Invoke-WebRequest -Uri ($apiOrigin+'/api/assets') -Method Options -Headers @{
    Origin=$siteOrigin
    'Access-Control-Request-Method'='POST'
    'Access-Control-Request-Headers'='content-type,x-write-token'
} -TimeoutSec 30
if ($preflight.StatusCode -ne 204 -or ($preflight.Headers['Access-Control-Allow-Origin'] -join ',') -cne $siteOrigin) {
    throw 'The Function did not allow the website origin.'
}

$token = Invoke-AzJson -Arguments @('functionapp','config','appsettings','list','--name',$state.functionName,
    '--resource-group',$resourceGroup,'--query',"[?name=='WRITE_TOKEN'].value | [0]")
if (-not $token -or $token.Length -lt 24) { throw 'The Function management token is missing. Run the Publish stage first.' }
$oldBase = [Environment]::GetEnvironmentVariable('STAYATLAS_BASE_URL','Process')
$oldToken = [Environment]::GetEnvironmentVariable('STAYATLAS_WRITE_TOKEN','Process')
try {
    $env:STAYATLAS_BASE_URL = $apiOrigin
    $env:STAYATLAS_WRITE_TOKEN = $token
    & node (Join-Path $projectRoot 'scripts/smoke.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'StayAtlas cloud CRUD or Translator verification failed. Check the error above.' }
} finally {
    [Environment]::SetEnvironmentVariable('STAYATLAS_BASE_URL',$oldBase,'Process')
    [Environment]::SetEnvironmentVariable('STAYATLAS_WRITE_TOKEN',$oldToken,'Process')
}
$smoke = Get-Content -LiteralPath (Join-Path $projectRoot 'reports/cloud-smoke.json') -Raw | ConvertFrom-Json
if (-not $smoke.completed -or $smoke.base -ne $apiOrigin) { throw 'The smoke test did not produce a completed cloud report.' }
$result = [ordered]@{
    resourceGroup=$resourceGroup
    region=$state.location
    website=$siteOrigin
    healthEndpoint=$apiOrigin+'/api/health'
    connections=$connectionStates
    workflows=$workflows
    websiteAndCorsVerified=$true
    cloudChecksPassed=$smoke.checks.Count
}
Write-PrivateJson -Path (Join-Path $projectRoot 'reports/cloud-deployment-summary.json') -Value $result
Write-Host 'STAYATLAS_DEPLOYMENT_RESULT'
$result | ConvertTo-Json -Depth 10
