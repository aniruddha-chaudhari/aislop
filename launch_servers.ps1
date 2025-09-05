# PowerShell script to launch two terminals:
# 1. Run pnpm dev in the chatterbox directory
# 2. Activate virtual environment and run FastAPI TTS server

# Terminal 1: Run pnpm dev
Start-Process powershell -ArgumentList "cd 'F:\Aniruddha\AI\chatterbox'; pnpm dev" -NoNewWindow:$false

# Terminal 2: Activate venv and run FastAPI server
Start-Process powershell -ArgumentList "cd 'F:\Aniruddha\AI\chatterbox'; .venv\Scripts\Activate.ps1; python fastapi_tts_server.py" -NoNewWindow:$false
