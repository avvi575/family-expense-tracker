param(
    [int]$Port = 3000,
    [string]$Directory = "D:\project1\family-expense-tracker\cc-parser-master\cc-parser-master\web"
)

$python = "D:\project1\family-expense-tracker\cc-parser-master\cc-parser-master\.venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Host "Python venv not found at: $python"
    exit 1
}

Write-Host "Starting cc-parser web UI on port $Port"
Write-Host "Serving directory: $Directory"
Write-Host "Open http://localhost:$Port/ in your browser"
Write-Host "Press Ctrl+C to stop."
Write-Host ""

& $python -m http.server $Port --directory $Directory
