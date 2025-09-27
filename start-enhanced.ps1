# Enhanced PowerShell script for remote access

param(
    [switch]$Remote,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
Usage: ./start.ps1 [options]

Options:
  -Remote    Start with ngrok tunnels for remote access
  -Help      Show this help message

Examples:
  ./start.ps1          # Local access only
  ./start.ps1 -Remote  # Enable remote access via ngrok

"@ -ForegroundColor Cyan
    exit
}

# Check if running as administrator for firewall rules
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin) {
    Write-Host "Adding firewall rules (requires administrator privileges)..." -ForegroundColor Yellow
    
    # Add firewall rules for Next.js Dev Server and Backend Server
    Start-Process powershell -Verb RunAs -ArgumentList "-Command", "netsh advfirewall firewall add rule name='Next.js Dev Server' dir=in action=allow protocol=TCP localport=5376; netsh advfirewall firewall add rule name='Backend Server' dir=in action=allow protocol=TCP localport=5000; Write-Host 'Firewall rules added successfully!' -ForegroundColor Green; pause"
    
    Write-Host "Firewall rules setup initiated. Please allow the administrator prompt." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
}

Write-Host "🚀 Starting AI Slop Services..." -ForegroundColor Green
Write-Host ""

# Terminal 1: Backend server (root directory)
Write-Host "📡 Starting Backend Server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "cd '$PSScriptRoot'; pnpm dev"

# Terminal 2: Frontend server (client directory)
Write-Host "🎨 Starting Frontend Server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "cd '$PSScriptRoot\client'; pnpm dev"

# Terminal 3: TTS Preprocessing service
Write-Host "🔊 Starting TTS Preprocessing Service..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "cd 'F:\Aniruddha\AI\ttspreprocessing'; & 'F:/Aniruddha/AI/ttspreprocessing/.venv/Scripts/Activate.ps1'; python app.py"

# Terminal 4: Chatterbox TTS server (using its own venv)
Write-Host "💬 Starting Chatterbox TTS Server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "cd 'F:\Aniruddha\AI\chatterbox'; & 'F:/Aniruddha/AI/chatterbox/.venv/Scripts/Activate.ps1'; python fastapi_tts_server.py"

if ($Remote) {
    # Wait a moment for servers to start up
    Write-Host ""
    Write-Host "⏳ Waiting for servers to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 8
    
    # Terminal 5: Ngrok tunnel for Frontend (accessible from anywhere)
    Write-Host "🌍 Starting ngrok tunnel for frontend..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Frontend Ngrok Tunnel' -ForegroundColor Green; ngrok http 5376 --log stdout"
    
    # Terminal 6: Ngrok tunnel for Backend (accessible from anywhere)  
    Write-Host "🌍 Starting ngrok tunnel for backend..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Backend Ngrok Tunnel' -ForegroundColor Green; ngrok http 5000 --log stdout"
    
    Write-Host ""
    Write-Host "📋 REMOTE ACCESS SETUP:" -ForegroundColor Yellow
    Write-Host "1. Check the ngrok terminals for public URLs" -ForegroundColor White
    Write-Host "2. Copy the BACKEND ngrok URL (https://xyz.ngrok.app)" -ForegroundColor White
    Write-Host "3. Update client/.env.local with: NEXT_PUBLIC_API_URL=https://your-backend-url.ngrok.app" -ForegroundColor White
    Write-Host "4. Restart the frontend server" -ForegroundColor White
    Write-Host "5. Use the FRONTEND ngrok URL to access from anywhere!" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "📱 LOCAL ACCESS:" -ForegroundColor Yellow
    Write-Host "Computer: http://localhost:5376" -ForegroundColor Cyan
    Write-Host "Mobile (same WiFi): http://192.168.0.106:5376" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "💡 Tip: Run './start.ps1 -Remote' for worldwide access!" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ All services started!" -ForegroundColor Green