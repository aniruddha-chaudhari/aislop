# WhisperX Timestamping API

A FastAPI server that provides audio transcription and word-level timestamping using WhisperX.

## Features

- **Audio Alignment**: Align audio with reference text to get precise word-level timestamps
- **Automatic Transcription**: Transcribe audio and generate word-level timestamps
- **GPU Support**: Automatically detects and uses CUDA if available
- **RESTful API**: Clean REST endpoints for easy integration
- **CORS Support**: Ready for web applications

## Installation

1. Install dependencies:
```bash
uv pip install -r requirements-gpu.txt --cache-dir "F:\Aniruddha\programs\UV"
```

## Running the Server

### Option 1: Using the run script
```bash
python run_server.py
```

### Option 2: Direct execution
```bash
python app.py
```

### Option 3: Using uvicorn directly
```bash
uvicorn app:app --host 0.0.0.0 --port 6000 --reload
```

The server will start at `http://localhost:6000`

## API Endpoints

### GET /
Get API information and available endpoints.

### GET /health
Health check with detailed status including device info and model loading status.

### GET /status
Get current service status and loaded models information.

### POST /align
Align audio with reference text to get word-level timestamps.

**Parameters:**
- `audio` (file): Audio file (MP3, WAV, etc.)
- `text` (string): Reference text for alignment
- `device` (optional): Device to use ('cuda' or 'cpu')
- `model` (optional): Whisper model size ('tiny', 'base', 'small', 'medium', 'large')
- `language` (optional): Language code (default: 'en')

**Example using curl:**
```bash
curl -X POST "http://localhost:6000/align" \
  -F "audio=@audio.wav" \
  -F "text=Hello world this is a test" \
  -F "device=cuda" \
  -F "model=base"
```

### POST /transcribe-align
Transcribe audio and get word-level timestamps.

**Parameters:**
- `audio` (file): Audio file (MP3, WAV, etc.)
- `device` (optional): Device to use ('cuda' or 'cpu')
- `model` (optional): Whisper model size
- `language` (optional): Language code (default: 'en')

**Example using curl:**
```bash
curl -X POST "http://localhost:6000/transcribe-align" \
  -F "audio=@audio.wav" \
  -F "device=cuda" \
  -F "model=base"
```

## Response Format

### Success Response
```json
{
  "success": true,
  "word_timestamps": [
    {
      "word": "Hello",
      "start": 0.0,
      "end": 0.5,
      "confidence": 0.99
    },
    {
      "word": "world",
      "start": 0.5,
      "end": 1.0,
      "confidence": 0.98
    }
  ],
  "total_duration": 2.5
}
```

### Transcribe-Align Response
```json
{
  "success": true,
  "transcription": "Hello world this is a test",
  "word_timestamps": [...],
  "total_duration": 2.5
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error description"
}
```

## Usage Examples

### Python Client
```python
import requests

# Align with reference text
files = {'audio': open('audio.wav', 'rb')}
data = {'text': 'Hello world', 'device': 'cuda'}
response = requests.post('http://localhost:6000/align', files=files, data=data)
result = response.json()

# Transcribe and align
files = {'audio': open('audio.wav', 'rb')}
data = {'device': 'cuda', 'model': 'base'}
response = requests.post('http://localhost:6000/transcribe-align', files=files, data=data)
result = response.json()
```

### JavaScript Client
```javascript
// Using fetch API
const formData = new FormData();
formData.append('audio', audioFile);
formData.append('text', 'Hello world');
formData.append('device', 'cuda');

fetch('http://localhost:6000/align', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => console.log(data));
```

## Configuration

The server automatically detects CUDA availability and uses GPU acceleration when available. You can override this by specifying the `device` parameter in API calls.

Available Whisper models:
- `tiny`: Fastest, least accurate
- `base`: Good balance
- `small`: Better accuracy
- `medium`: High accuracy
- `large`: Best accuracy, slowest

## Development

The server includes automatic reloading for development. Models are loaded on-demand and cached for performance.

## Docker Support

To run in Docker, create a Dockerfile:

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements-gpu.txt .
RUN pip install -r requirements-gpu.txt

COPY . .
EXPOSE 6000

CMD ["python", "run_server.py"]
```
PS F:\Aniruddha\AI\ttspreprocessing> & F:/Aniruddha/AI/ttspreprocessing/.venv/Scripts/Activate.ps1
python app.py   