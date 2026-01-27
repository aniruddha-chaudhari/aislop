# PowerShell script to start all services in separate terminals

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin) {
    Write-Host "Adding firewall rules (requires administrator privileges)..." -ForegroundColor Yellow
    
    # Add firewall rules for Next.js Dev Server and Backend Server
    Start-Process powershell -Verb RunAs -ArgumentList "-Command", "netsh advfirewall firewall add rule name='Next.js Dev Server' dir=in action=allow protocol=TCP localport=5376; netsh advfirewall firewall add rule name='Backend Server' dir=in action=allow protocol=TCP localport=5000; Write-Host 'Firewall rules added successfully!' -ForegroundColor Green; pause"
    
    Write-Host "Firewall rules setup initiated. Please allow the administrator prompt." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
}

# Terminal 1: Backend server (root directory)
Start-Process powershell -ArgumentList "-NoExit", "cd '$PSScriptRoot'; pnpm dev"

# Terminal 2: Frontend server (client directory)
Start-Process powershell -ArgumentList "-NoExit", "cd '$PSScriptRoot\client'; pnpm dev"

# Terminal 3: TTS Preprocessing service
Start-Process powershell -ArgumentList "-NoExit", "cd 'F:\Aniruddha\AI\ttspreprocessing'; & 'F:/Aniruddha/AI/ttspreprocessing/.venv/Scripts/Activate.ps1'; python app.py"

# Terminal 4: Chatterbox TTS server (using its own venv)
Start-Process powershell -ArgumentList "-NoExit", "cd 'F:\Aniruddha\AI\chatterbox'; & 'F:/Aniruddha/AI/chatterbox/.venv/Scripts/Activate.ps1'; python fastapi_tts_server.py"

