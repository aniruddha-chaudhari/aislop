# Chatterbox TTS FastAPI Server

A FastAPI server that provides a REST API for text-to-speech generation using Chatterbox TTS models. This replaces the Gradio interface with a more robust, scalable API solution.

## Features

- 🚀 **FastAPI-based REST API** - Modern, fast, and auto-documented
- 🎤 **Text-to-Speech Generation** - Convert text to speech with voice cloning
- 🎵 **Voice Cloning** - Use reference audio to clone voices
- ⚙️ **Configurable Parameters** - Fine-tune generation with various sampling parameters
- 📚 **Auto-generated Documentation** - Interactive API docs at `/docs`
- 🔒 **File Management** - Temporary audio file handling with cleanup endpoints
- 🌐 **CORS Support** - Cross-origin request support for web applications

## Installation

### Prerequisites

- Python 3.8+
- PyTorch (with CUDA support recommended)
- Chatterbox TTS package

### Install Dependencies

```bash
pip install -r requirements_fastapi.txt
```

### Install Chatterbox TTS

```bash
pip install -e .
```

## Quick Start

### 1. Start the Server

```bash
python fastapi_tts_server.py
```

The server will start on `http://localhost:8000`

### 2. Access API Documentation

- **Interactive Docs**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### 3. Health Check

```bash
curl http://localhost:8000/health
```

## API Endpoints

### Base URL
```
http://localhost:8000
```

### 1. Root Endpoint
- **GET** `/`
- **Description**: API information and available endpoints
- **Response**: Basic API details

### 2. Health Check
- **GET** `/health`
- **Description**: Check server health and model status
- **Response**:
```json
{
  "status": "healthy",
  "device": "cuda",
  "model_loaded": true
}
```

### 3. Generate Audio
- **POST** `/generate`
- **Description**: Generate audio from text using voice cloning
- **Content-Type**: `multipart/form-data`

#### Request Parameters

| Parameter | Type | Required | Default | Range | Description |
|-----------|------|----------|---------|-------|-------------|
| `text` | string | Yes | - | max 300 chars | Text to synthesize |
| `audio_prompt` | file | Yes | - | - | Reference audio file |
| `exaggeration` | float | No | 0.5 | 0.25 - 2.0 | Exaggeration level |
| `temperature` | float | No | 0.8 | 0.05 - 5.0 | Sampling temperature |
| `seed_num` | integer | No | 0 | - | Random seed (0 = random) |
| `cfg_weight` | float | No | 0.5 | 0.0 - 1.0 | CFG/Pace weight |
| `min_p` | float | No | 0.05 | 0.0 - 1.0 | min_p sampler parameter |
| `top_p` | float | No | 1.0 | 0.0 - 1.0 | top_p sampler parameter |
| `repetition_penalty` | float | No | 1.2 | 1.0 - 2.0 | Repetition penalty |

#### Response
```json
{
  "message": "Audio generated successfully",
  "audio_file_path": "/tmp/chatterbox_tts/output_uuid.wav",
  "sample_rate": 22050,
  "duration": 3.45
}
```

### 4. Download Audio
- **GET** `/audio/{filename}`
- **Description**: Download generated audio file
- **Response**: Audio file (WAV format)

### 5. Delete Audio
- **DELETE** `/audio/{filename}`
- **Description**: Delete a specific audio file
- **Response**:
```json
{
  "message": "Audio file filename.wav deleted successfully"
}
```

### 6. Cleanup
- **GET** `/cleanup`
- **Description**: Clean up all temporary audio files
- **Response**:
```json
{
  "message": "Cleaned up 5 temporary files"
}
```

## Usage Examples

### cURL Examples

#### Basic Audio Generation
```bash
curl -X POST "http://localhost:8000/generate" \
  -F "text=Hello, this is a test message." \
  -F "audio_prompt=@reference_audio.wav" \
  -F "exaggeration=0.5" \
  -F "temperature=0.8"
```

#### Custom Parameters
```bash
curl -X POST "http://localhost:8000/generate" \
  -F "text=This is a custom voice generation test." \
  -F "audio_prompt=@voice_sample.wav" \
  -F "exaggeration=0.8" \
  -F "temperature=1.2" \
  -F "seed_num=42" \
  -F "cfg_weight=0.7" \
  -F "min_p=0.02" \
  -F "top_p=0.9" \
  -F "repetition_penalty=1.1"
```

### Python Examples

#### Using requests library
```python
import requests

# Generate audio
files = {'audio_prompt': open('reference.wav', 'rb')}
data = {
    'text': 'Hello, this is a test message.',
    'exaggeration': 0.5,
    'temperature': 0.8
}

response = requests.post('http://localhost:8000/generate', 
                        files=files, data=data)
result = response.json()

# Download the generated audio
audio_filename = result['audio_file_path'].split('/')[-1]
audio_response = requests.get(f'http://localhost:8000/audio/{audio_filename}')

with open('generated_audio.wav', 'wb') as f:
    f.write(audio_response.content)
```

#### Using httpx (async)
```python
import httpx
import asyncio

async def generate_audio():
    async with httpx.AsyncClient() as client:
        files = {'audio_prompt': open('reference.wav', 'rb')}
        data = {'text': 'Hello, this is a test message.'}
        
        response = await client.post('http://localhost:8000/generate', 
                                   files=files, data=data)
        result = response.json()
        print(f"Generated: {result['audio_file_path']}")

asyncio.run(generate_audio())
```

### JavaScript/Node.js Examples

#### Using fetch
```javascript
async function generateAudio(text, audioFile) {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('audio_prompt', audioFile);
    formData.append('exaggeration', '0.5');
    formData.append('temperature', '0.8');
    
    const response = await fetch('http://localhost:8000/generate', {
        method: 'POST',
        body: formData
    });
    
    const result = await response.json();
    console.log('Generated audio:', result);
    
    // Download the audio
    const audioResponse = await fetch(`http://localhost:8000/audio/${result.audio_file_path.split('/').pop()}`);
    const audioBlob = await audioResponse.blob();
    
    // Create download link
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'generated_audio.wav';
    a.click();
}
```

## Configuration

### Environment Variables

The server can be configured using environment variables:

- `DEVICE`: Force device selection (`cuda`, `cpu`, `mps`)
- `PORT`: Server port (default: 8000)
- `HOST`: Server host (default: 0.0.0.0)

### Model Parameters

#### Exaggeration (0.25 - 2.0)
- **0.25**: Very calm, subdued voice
- **0.5**: Neutral, natural voice (default)
- **1.0**: Expressive, animated voice
- **2.0**: Very exaggerated, dramatic voice

#### Temperature (0.05 - 5.0)
- **0.05**: Very deterministic, consistent output
- **0.8**: Balanced creativity (default)
- **2.0**: High creativity, varied output
- **5.0**: Maximum randomness

#### CFG Weight (0.0 - 1.0)
- **0.0**: No guidance, pure generation
- **0.5**: Balanced guidance (default)
- **1.0**: Strong guidance, more controlled

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- **400**: Bad Request (invalid parameters)
- **404**: Not Found (file not found)
- **500**: Internal Server Error (model/generation errors)

### Error Response Format
```json
{
  "detail": "Error description"
}
```

## Performance Considerations

### Model Loading
- Model is loaded once on startup and reused
- Subsequent requests use the same model instance
- Model loading time: ~30-60 seconds (depending on device)

### Generation Time
- **CPU**: 10-30 seconds per request
- **GPU**: 2-10 seconds per request
- **MPS (Apple Silicon)**: 5-15 seconds per request

### Memory Usage
- **Model**: ~2-4 GB RAM
- **Temporary files**: ~10-50 MB per request
- **GPU VRAM**: ~2-6 GB (if using CUDA)

## Security Considerations

- **CORS**: Enabled for all origins (configure as needed)
- **File Uploads**: Only audio files accepted
- **Temporary Files**: Automatically cleaned up
- **Input Validation**: All parameters validated with Pydantic

## Troubleshooting

### Common Issues

1. **Model Loading Fails**
   - Check CUDA installation
   - Verify sufficient RAM/VRAM
   - Check internet connection for model download

2. **Audio Generation Fails**
   - Verify reference audio format (WAV recommended)
   - Check text length (max 300 characters)
   - Ensure all required parameters are provided

3. **Server Won't Start**
   - Check port availability
   - Verify dependencies installation
   - Check Python version compatibility

### Logs

The server provides detailed logging:
- Model loading status
- Request processing
- Error details
- Performance metrics

## Development

### Running in Development Mode

```bash
python fastapi_tts_server.py
```

The server runs with auto-reload enabled for development.

### Production Deployment

For production deployment:

1. Use a production ASGI server (Gunicorn, Hypercorn)
2. Configure proper CORS settings
3. Set up reverse proxy (Nginx)
4. Implement rate limiting
5. Add authentication if needed

### Example Production Command

```bash
gunicorn fastapi_tts_server:app -w 1 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

## License

This project is licensed under the same license as the Chatterbox TTS package.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the API documentation at `/docs`
3. Check the server logs for error details
4. Verify your environment meets the requirements
