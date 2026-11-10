param(
    [Parameter(Mandatory = $true)]
    [string] $BaseUrl
)

$lastPromptedAt = [datetime]::MinValue
$serverUnavailableReported = $false
$host.UI.RawUI.WindowTitle = 'StreamOps Twitch login monitor'

while ($true) {
    try {
        $status = Invoke-RestMethod -Uri "$BaseUrl/oauth/status" -TimeoutSec 5
        $serverUnavailableReported = $false

        if ($status.status -eq 'connected') {
            $lastPromptedAt = [datetime]::MinValue
        }
        elseif (
            $status.status -in @('login-required', 'failed') -and
            ((Get-Date) - $lastPromptedAt).TotalSeconds -ge 120
        ) {
            try {
                $login = Invoke-RestMethod -Method Get -Uri "$BaseUrl/oauth" -TimeoutSec 15

                if (
                    [string]::IsNullOrWhiteSpace($login.verificationUri) -or
                    [string]::IsNullOrWhiteSpace($login.userCode)
                ) {
                    throw 'Twitch device authorization returned an invalid URL or user code.'
                }

                $verificationUri = [Uri]$login.verificationUri
                if ($verificationUri.Scheme -ne 'https') {
                    throw 'Twitch device authorization returned a non-HTTPS URL.'
                }

                Write-Host "Twitch login required. Enter code $($login.userCode) at $($verificationUri.AbsoluteUri)." -ForegroundColor Yellow
                Start-Process -FilePath $verificationUri.AbsoluteUri
                $lastPromptedAt = Get-Date
            }
            catch {
                Write-Warning "Could not start Twitch login: $($_.Exception.Message)"
            }
        }
    }
    catch {
        if (-not $serverUnavailableReported) {
            Write-Warning "Waiting for StreamOps Twitch status: $($_.Exception.Message)"
            $serverUnavailableReported = $true
        }
    }

    Start-Sleep -Seconds 10
}
