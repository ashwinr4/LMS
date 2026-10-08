param(
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'

# Qualiva Advanced Local Security Audit
# Target: local Qualiva frontend/backend only.
# Requires: Docker Desktop, Qualiva client/server running, JWTs in the current PowerShell session.

$ProjectRoot = (Get-Location).Path
$ReportDir = Join-Path $ProjectRoot 'security-reports'
$ZapImage = 'ghcr.io/zaproxy/zaproxy:stable'
$ApiSpec = Join-Path $ProjectRoot 'server\qualiva-openapi.yaml'
$UploadPlan = Join-Path $ProjectRoot 'qualiva-upload-zap-master.yaml'
$UploadTestFile = Join-Path $ProjectRoot 'qualiva-upload-test.html'

New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null

function Require-Env([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "$Name is not set in this PowerShell session."
    }
}

function Invoke-ZapContainer {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string[]]$DockerArgs,
        [Parameter(Mandatory = $true)][string]$LogFile
    )

    Write-Host "[$Label]" -ForegroundColor Cyan
    & docker @DockerArgs 2>&1 | Tee-Object -FilePath $LogFile
    $exitCode = $LASTEXITCODE

    # ZAP packaged scans can return non-zero when findings/warnings exist.
    # The audit should continue so all reports are produced.
    if ($exitCode -ne 0) {
        Write-Warning "$Label returned exit code $exitCode. See $LogFile. Continuing with the remaining tests."
    }
    return $exitCode
}

function Test-Url([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
        return [int]$response.StatusCode
    }
    catch {
        if ($_.Exception.Response) {
            return [int]$_.Exception.Response.StatusCode.value__
        }
        throw
    }
}

function Invoke-JsonWithBearer([string]$Url, [string]$Token) {
    $headers = @{ Authorization = "Bearer $Token" }
    try {
        return Invoke-RestMethod -Uri $Url -Headers $headers -Method Get -TimeoutSec 15
    }
    catch {
        throw "Request failed for $Url : $($_.Exception.Message)"
    }
}

Write-Host '============================================================' -ForegroundColor DarkCyan
Write-Host ' QUALIVA ADVANCED OWASP ZAP SECURITY AUDIT' -ForegroundColor DarkCyan
Write-Host ' Local authorized test target only' -ForegroundColor DarkCyan
Write-Host '============================================================' -ForegroundColor DarkCyan

Require-Env 'QUALIVA_STUDENT_TOKEN'
Require-Env 'QUALIVA_UPLOAD_TOKEN'

if (-not (Test-Path $ApiSpec)) { throw "Missing API specification: $ApiSpec" }

if (-not (Test-Path $UploadTestFile)) {
    @'
<!doctype html>
<html>
<head><title>Qualiva ZAP Upload Test</title></head>
<body>QUALIVA_ZAP_UPLOAD_TEST</body>
</html>
'@ | Set-Content -Encoding utf8 $UploadTestFile
}

Write-Host 'Checking required tools...' -ForegroundColor Cyan
& docker version | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker is not available.' }

$backendStatus = Test-Url 'http://localhost:5050/api/v1/auth/me'
if ($backendStatus -notin @(200, 401)) {
    throw "Backend health check returned HTTP $backendStatus. Expected 200 or 401."
}

$frontendStatus = Test-Url 'http://localhost:5173/'
if ($frontendStatus -lt 200 -or $frontendStatus -ge 500) {
    throw "Frontend health check returned HTTP $frontendStatus."
}

Write-Host "Backend: HTTP $backendStatus" -ForegroundColor Green
Write-Host "Frontend: HTTP $frontendStatus" -ForegroundColor Green

# Identify the supplied authenticated account roles without printing JWTs.
$studentMe = Invoke-JsonWithBearer 'http://localhost:5050/api/v1/auth/me' $env:QUALIVA_STUDENT_TOKEN
$privilegedMe = Invoke-JsonWithBearer 'http://localhost:5050/api/v1/auth/me' $env:QUALIVA_UPLOAD_TOKEN

if ($null -ne $studentMe.user -and $null -ne $studentMe.user.role) {
    $studentRole = [string]$studentMe.user.role
} else {
    $studentRole = [string]$studentMe.role
}
if ($null -ne $privilegedMe.user -and $null -ne $privilegedMe.user.role) {
    $privilegedRole = [string]$privilegedMe.user.role
} else {
    $privilegedRole = [string]$privilegedMe.role
}

Write-Host "Student token role: $studentRole" -ForegroundColor Green
Write-Host "Creator/Admin token role: $privilegedRole" -ForegroundColor Green

# Build and validate the upload plan before any expensive ZAP scans.
@'
env:
  contexts:
    - name: QualivaUpload
      urls:
        - http://host.docker.internal:5050
      includePaths:
        - 'http://host\.docker\.internal:5050/api/v1/modules/upload-media.*'
        - 'http://host\.docker\.internal:5050/uploads/lessons/.*'
  parameters:
    failOnError: true
    failOnWarning: false
    continueOnFailure: false
    progressToStdout: true
jobs:
  - type: requestor
    requests:
      - name: HTML multipart upload
        url: http://host.docker.internal:5050/api/v1/modules/upload-media
        method: POST
        headers:
          - 'Authorization: Bearer ${QUALIVA_UPLOAD_TOKEN}'
          - 'Content-Type: multipart/form-data; boundary=----QualivaZAPBoundary'
        data: "------QualivaZAPBoundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"qualiva-zap-upload-test.html\"\r\nContent-Type: text/html\r\n\r\n<!doctype html><html><head><title>Qualiva ZAP Upload Test</title></head><body>QUALIVA_ZAP_UPLOAD_TEST</body></html>\r\n------QualivaZAPBoundary--\r\n"
        responseCode: 200
      - name: SVG multipart upload
        url: http://host.docker.internal:5050/api/v1/modules/upload-media
        method: POST
        headers:
          - 'Authorization: Bearer ${QUALIVA_UPLOAD_TOKEN}'
          - 'Content-Type: multipart/form-data; boundary=----QualivaZAPBoundary2'
        data: "------QualivaZAPBoundary2\r\nContent-Disposition: form-data; name=\"file\"; filename=\"qualiva-zap-upload-test.svg\"\r\nContent-Type: image/svg+xml\r\n\r\n<svg xmlns=\"http://www.w3.org/2000/svg\"><script>document.body.dataset.qualiva='test'</script></svg>\r\n------QualivaZAPBoundary2--\r\n"
        responseCode: 200
      - name: JavaScript multipart upload
        url: http://host.docker.internal:5050/api/v1/modules/upload-media
        method: POST
        headers:
          - 'Authorization: Bearer ${QUALIVA_UPLOAD_TOKEN}'
          - 'Content-Type: multipart/form-data; boundary=----QualivaZAPBoundary3'
        data: "------QualivaZAPBoundary3\r\nContent-Disposition: form-data; name=\"file\"; filename=\"qualiva-zap-upload-test.js\"\r\nContent-Type: application/javascript\r\n\r\nconsole.log('QUALIVA_ZAP_UPLOAD_TEST');\r\n------QualivaZAPBoundary3--\r\n"
        responseCode: 200
  - type: activeScan
    parameters:
      context: QualivaUpload
      url: http://host.docker.internal:5050/api/v1/modules/upload-media
      defaultStrength: Medium
      defaultThreshold: Low
      maxScanDurationInMins: 10
      threadPerHost: 1
      delayInMs: 100
  - type: passiveScan-wait
  - type: report
    parameters:
      template: traditional-html-plus
      reportDir: /zap/wrk/security-reports
      reportFile: file-upload-security.html
      reportTitle: Qualiva File Upload Security Test
      reportDescription: Authenticated ZAP active test of the Qualiva lesson media upload endpoint.
'@ | Set-Content -Encoding utf8 $UploadPlan

Write-Host 'Validating the file-upload ZAP plan...' -ForegroundColor Yellow
& docker run --rm -t `
    '-e' "QUALIVA_UPLOAD_TOKEN=$($env:QUALIVA_UPLOAD_TOKEN)" `
    '-e' 'ZAP_AUTH_HEADER=Authorization' `
    '-e' "ZAP_AUTH_HEADER_VALUE=Bearer $($env:QUALIVA_UPLOAD_TOKEN)" `
    '-e' 'ZAP_AUTH_HEADER_SITE=host.docker.internal:5050' `
    '-v' "${ProjectRoot}:/zap/wrk/:rw" `
    $ZapImage `
    zap.sh -cmd -autocheck /zap/wrk/qualiva-upload-zap-master.yaml 2>&1 | Tee-Object -FilePath (Join-Path $ReportDir 'file-upload-plan-check.log')
$planCheckExit = $LASTEXITCODE
if ($planCheckExit -ne 0) {
    throw "ZAP file-upload automation plan validation failed. See $ReportDir\file-upload-plan-check.log"
}

if ($ValidateOnly) {
    Write-Host 'Validation succeeded. No security scans were started.' -ForegroundColor Green
    exit 0
}


# Qualiva-specific RBAC smoke checks are run BEFORE ZAP scans so ZAP traffic cannot
# consume the application's rate-limit budget before the authorization assertions.
Write-Host '[RBAC] Qualiva authorization smoke checks' -ForegroundColor Cyan
$rbacResults = @()

function Invoke-RbacGet([string]$Name, [string]$Url, [string]$Token, [string]$Expected) {
    try {
        $r = Invoke-WebRequest -Uri $Url -Headers @{ Authorization = "Bearer $Token" } -Method Get -UseBasicParsing -TimeoutSec 15
        $code = [int]$r.StatusCode
    }
    catch {
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode.value__ } else { -1 }
    }
    $pass = if ($Expected -eq '403') { $code -eq 403 } else { $code -ge 200 -and $code -lt 300 }
    return [pscustomobject]@{ Test=$Name; Expected=$Expected; Actual=$code; Result=if ($pass) {'PASS'} else {'REVIEW'} }
}

$rbacResults += Invoke-RbacGet 'Student -> Admin users' 'http://localhost:5050/api/v1/admin/users' $env:QUALIVA_STUDENT_TOKEN '403'
$rbacResults += Invoke-RbacGet 'Student -> Admin dashboard' 'http://localhost:5050/api/v1/admin/dashboard-summary' $env:QUALIVA_STUDENT_TOKEN '403'
$rbacResults += Invoke-RbacGet 'Student -> Creator queue' 'http://localhost:5050/api/v1/enrollments/creator-queue' $env:QUALIVA_STUDENT_TOKEN '403'

if ($studentRole -eq 'COURSE_CREATOR') {
    # This is only informational if the so-called Student token is actually a creator token.
    $rbacResults += Invoke-RbacGet 'Student token -> Admin users' 'http://localhost:5050/api/v1/admin/users' $env:QUALIVA_STUDENT_TOKEN '403'
}
if ($privilegedRole -eq 'COURSE_CREATOR') {
    $rbacResults += Invoke-RbacGet 'Creator -> Admin users' 'http://localhost:5050/api/v1/admin/users' $env:QUALIVA_UPLOAD_TOKEN '403'
}
if ($privilegedRole -eq 'ADMIN') {
    $rbacResults += Invoke-RbacGet 'Admin -> Admin users' 'http://localhost:5050/api/v1/admin/users' $env:QUALIVA_UPLOAD_TOKEN '2xx'
}

$rbacResults | Export-Csv -NoTypeInformation -Encoding UTF8 (Join-Path $ReportDir 'rbac-smoke-results.csv')
$rbacResults | Format-Table -AutoSize

# 1. Frontend scan
Invoke-ZapContainer -Label '1/8 Frontend ZAP full scan' -DockerArgs @(
    'run','--rm','-t',
    '-v',"${ProjectRoot}:/zap/wrk/:rw",
    $ZapImage,
    'zap-full-scan.py','-t','http://host.docker.internal:5173','-j','-I',
    '-r','/zap/wrk/security-reports/frontend-zap.html'
) -LogFile (Join-Path $ReportDir 'frontend-zap.log') | Out-Null

# 2. Backend/root scan
Invoke-ZapContainer -Label '2/8 Backend/root ZAP full scan' -DockerArgs @(
    'run','--rm','-t',
    '-v',"${ProjectRoot}:/zap/wrk/:rw",
    $ZapImage,
    'zap-full-scan.py','-t','http://host.docker.internal:5050','-j','-I',
    '-r','/zap/wrk/security-reports/backend-root-zap.html'
) -LogFile (Join-Path $ReportDir 'backend-root-zap.log') | Out-Null

# 3. Unauthenticated OpenAPI API scan
Invoke-ZapContainer -Label '3/8 Unauthenticated OpenAPI/API active scan' -DockerArgs @(
    'run','--rm','-t',
    '-v',"${ProjectRoot}:/zap/wrk/:rw",
    $ZapImage,
    'zap-api-scan.py','-t','/zap/wrk/server/qualiva-openapi.yaml','-f','openapi','-I',
    '-r','/zap/wrk/security-reports/api-unauthenticated.html',
    '-J','/zap/wrk/security-reports/api-unauthenticated.json'
) -LogFile (Join-Path $ReportDir 'api-unauthenticated.log') | Out-Null

# 4. Student-authenticated API scan
Invoke-ZapContainer -Label '4/8 Student-authenticated OpenAPI/API active scan' -DockerArgs @(
    'run','--rm','-t',
    '-e',"ZAP_AUTH_HEADER_VALUE=Bearer $($env:QUALIVA_STUDENT_TOKEN)",
    '-e','ZAP_AUTH_HEADER=Authorization',
    '-e','ZAP_AUTH_HEADER_SITE=host.docker.internal:5050',
    '-v',"${ProjectRoot}:/zap/wrk/:rw",
    $ZapImage,
    'zap-api-scan.py','-t','/zap/wrk/server/qualiva-openapi.yaml','-f','openapi','-I',
    '-r','/zap/wrk/security-reports/api-student-authenticated.html',
    '-J','/zap/wrk/security-reports/api-student-authenticated.json'
) -LogFile (Join-Path $ReportDir 'api-student-authenticated.log') | Out-Null

# 5. Creator/Admin-authenticated API scan
Invoke-ZapContainer -Label '5/8 Creator/Admin-authenticated OpenAPI/API active scan' -DockerArgs @(
    'run','--rm','-t',
    '-e',"ZAP_AUTH_HEADER_VALUE=Bearer $($env:QUALIVA_UPLOAD_TOKEN)",
    '-e','ZAP_AUTH_HEADER=Authorization',
    '-e','ZAP_AUTH_HEADER_SITE=host.docker.internal:5050',
    '-v',"${ProjectRoot}:/zap/wrk/:rw",
    $ZapImage,
    'zap-api-scan.py','-t','/zap/wrk/server/qualiva-openapi.yaml','-f','openapi','-I',
    '-r','/zap/wrk/security-reports/api-creator-admin.html',
    '-J','/zap/wrk/security-reports/api-creator-admin.json'
) -LogFile (Join-Path $ReportDir 'api-creator-admin.log') | Out-Null

# 6/8 marker: RBAC already completed above.
# 7/8 Actual multipart upload + ZAP active scan + HTML report.
Write-Host '[7/8] Actual multipart file-upload ZAP active test' -ForegroundColor Cyan
Invoke-ZapContainer -Label 'Running authenticated multipart upload active scan' -DockerArgs @(
    'run','--rm','-t',
    '-e',"QUALIVA_UPLOAD_TOKEN=$($env:QUALIVA_UPLOAD_TOKEN)",
    '-e','ZAP_AUTH_HEADER=Authorization',
    '-e',"ZAP_AUTH_HEADER_VALUE=Bearer $($env:QUALIVA_UPLOAD_TOKEN)",
    '-e','ZAP_AUTH_HEADER_SITE=host.docker.internal:5050',
    '-v',"${ProjectRoot}:/zap/wrk/:rw",
    $ZapImage,
    'zap.sh','-cmd','-autorun','/zap/wrk/qualiva-upload-zap-master.yaml'
) -LogFile (Join-Path $ReportDir 'file-upload-zap.log') | Out-Null

# Verify that the actual uploaded files are directly retrievable and record their content types.
Write-Host 'Checking uploaded-file direct access...' -ForegroundColor Cyan
$uploadDir = Join-Path $ProjectRoot 'server\uploads\lessons'
$accessResults = @()
if (Test-Path $uploadDir) {
    $recentUploads = Get-ChildItem $uploadDir -File | Where-Object { $_.Name -match 'qualiva-zap-upload-test' } | Sort-Object LastWriteTime -Descending | Select-Object -First 10
    foreach ($file in $recentUploads) {
        $url = "http://localhost:5050/uploads/lessons/$([uri]::EscapeDataString($file.Name))"
        try {
            $resp = Invoke-WebRequest -Uri $url -Method Get -UseBasicParsing -TimeoutSec 15
            $accessResults += [pscustomobject]@{ File=$file.Name; Status=[int]$resp.StatusCode; ContentType=[string]$resp.Headers['Content-Type']; Accessible=$true }
        } catch {
            $accessResults += [pscustomobject]@{ File=$file.Name; Status=if ($_.Exception.Response) {[int]$_.Exception.Response.StatusCode.value__} else {-1}; ContentType=''; Accessible=$false }
        }
    }
}
$accessResults | Export-Csv -NoTypeInformation -Encoding UTF8 (Join-Path $ReportDir 'uploaded-file-access-results.csv')
$accessResults | Format-Table -AutoSize

# 8/8 Final manifest.
Write-Host '[8/8] Writing audit manifest' -ForegroundColor Cyan
$generated = Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
@"
Qualiva Advanced OWASP ZAP Security Audit
Generated: $generated

Automated ZAP reports:
- frontend-zap.html
- backend-root-zap.html
- api-unauthenticated.html / api-unauthenticated.json
- api-student-authenticated.html / api-student-authenticated.json
- api-creator-admin.html / api-creator-admin.json
- file-upload-security.html

Qualiva-specific authorization output:
- rbac-smoke-results.csv
- uploaded-file-access-results.csv

The API scans are driven by server/qualiva-openapi.yaml.
Authenticated API scans use ZAP authentication-header environment variables.
The file-upload test sends real multipart/form-data requests for HTML, SVG, and JavaScript content and runs ZAP active scanning against the upload endpoint.

Important scope limitation:
Generic ZAP active scanning cannot prove arbitrary business-logic authorization or every IDOR/BOLA case. The included RBAC checks cover selected role boundaries; full IDOR testing requires known resource ownership and suitable accounts/resources.
"@ | Set-Content -Encoding utf8 (Join-Path $ReportDir 'AUDIT-MANIFEST.txt')

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host ' AUDIT COMPLETE' -ForegroundColor Green
Write-Host " Reports: $ReportDir" -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
Get-ChildItem $ReportDir -File | Select-Object Name, Length | Format-Table -AutoSize
