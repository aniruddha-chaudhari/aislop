# PowerShell script to start all services in separate terminals

# Terminal 1: Backend server (root directory)
Start-Process powershell -ArgumentList "-NoExit", "cd '$PSScriptRoot'; pnpm dev"

# Terminal 2: Frontend server (client directory)
Start-Process powershell -ArgumentList "-NoExit", "cd '$PSScriptRoot\client'; pnpm dev"

# Terminal 3: TTS Preprocessing service
Start-Process powershell -ArgumentList "-NoExit", "cd 'F:\Aniruddha\AI\ttspreprocessing'; & 'F:/Aniruddha/AI/ttspreprocessing/.venv/Scripts/Activate.ps1'; python app.py"

# Terminal 4: Chatterbox TTS server (using its own venv)
Start-Process powershell -ArgumentList "-NoExit", "cd 'F:\Aniruddha\AI\chatterbox'; & 'F:/Aniruddha/AI/chatterbox/.venv/Scripts/Activate.ps1'; python fastapi_tts_server.py"