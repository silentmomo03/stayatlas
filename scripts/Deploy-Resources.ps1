param(
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9._()-]+$')][string]$ResourceGroup,
    [Parameter(Mandatory)][ValidatePattern('^[a-z0-9]+$')][string]$Location,
    [ValidatePattern('^[a-z][a-z0-9]{2,9}$')][string]$Prefix = 'stayatlas',
    [ValidateSet('F0','S1')][string]$TranslatorSku = 'F0',
    [switch]$Apply
)
. (Join-Path $PSScriptRoot 'Azure-Common.ps1')
$projectRoot = Get-ProjectRoot
$account = Invoke-AzJson -Arguments @('account','show')
$templatePath = Join-Path $projectRoot 'infra/main.json'
$templateParameters = @(('location=' + $Location), ('prefix=' + $Prefix), ('translatorSku=' + $TranslatorSku))
$flexLocations = @(Invoke-AzJson -Arguments @('functionapp','list-flexconsumption-locations','--query','[].name'))
if ($Location -notin ($flexLocations -replace '[^a-zA-Z0-9]','')) {
    throw ('Flex Consumption is not listed for '+$Location+' in the selected subscription. Check az functionapp list-flexconsumption-locations.')
}
if ($Apply) {
    $appProvider = Invoke-AzJson -Arguments @('provider','show','--namespace','Microsoft.App')
    if ($appProvider.registrationState -ne 'Registered') {
        Write-Host 'Registering Microsoft.App for Flex Consumption...'
        $null = Invoke-AzJson -Arguments @('provider','register','--namespace','Microsoft.App','--wait')
    }
}
$existsResult = Invoke-AzJson -Arguments @('group','exists','--name',$ResourceGroup)
if (-not $existsResult) {
    if (-not $Apply) { throw 'The resource group does not exist. Review infra/main.json and the budget, then use -Apply to create this named project group.' }
    $null = Invoke-AzJson -Arguments @('group','create','--name',$ResourceGroup,'--location',$Location)
}
$null = Invoke-AzJson -Arguments (@('deployment','group','validate','--resource-group',$ResourceGroup,'--template-file',$templatePath,'--parameters') + $templateParameters)
if (-not $Apply) {
    & az deployment group what-if --resource-group $ResourceGroup --template-file $templatePath --parameters @templateParameters --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Azure what-if failed.' }
    Write-Host 'Validation / what-if completed. No resources were deployed by this run.'
    return
}
$deployment = Invoke-AzJson -Arguments (@('deployment','group','create','--resource-group',$ResourceGroup,'--name','stayatlas-resources','--mode','Incremental','--template-file',$templatePath,'--parameters') + $templateParameters)
$state = [ordered]@{ subscriptionId=$account.id; resourceGroup=$ResourceGroup; location=$Location }
foreach ($property in $deployment.properties.outputs.PSObject.Properties) { $state[$property.Name] = $property.Value.value }
Write-PrivateJson -Path (Join-Path $projectRoot '.local/cloud/resources.json') -Value $state
Write-Host ('StayAtlas resources ready in '+$ResourceGroup+' / '+$Location+'.')
