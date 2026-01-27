#!/usr/bin/env python3
"""
FastAPI application for WhisperX Timestamping API
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import os
import shutil
import json
from pathlib import Path
from timestammping import WhisperXAligner
import uvicorn
import torch
import logging
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="WhisperX Timestamping API",
    description="API for generating word-level and sentence-level timestamps using WhisperX",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Check for CUDA availability
device = "cuda" if torch.cuda.is_available() else "cpu"
logger.info(f"Using device: {device}")
print(f"Using device: {device}")

# Global aligner instance
aligner = None

@app.on_event("startup")
async def startup_event():
    """Initialize the WhisperX aligner on startup"""
    global aligner
    logger.info("Initializing WhisperXAligner...")
    try:
        aligner = WhisperXAligner(device=device, model_name="base")
        logger.info("WhisperXAligner initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize WhisperXAligner: {e}")
        logger.error(traceback.format_exc())
        print(f"ERROR: Failed to initialize WhisperXAligner: {e}")
        raise

@app.post("/align")
async def align_audio_with_text(
    audio: UploadFile = File(...),
    text: str = Form(...),
    device_param: str = Form(None),
    model: str = Form("base"),
    language: str = Form("en"),
    clean: str = Form(default="false")
):
    """
    Align audio with reference text to get timestamps
    
    Args:
        audio: Audio file to align
        text: Reference text for alignment
        device_param: Device to use (cpu/cuda)
        model: WhisperX model size
        language: Language code
        clean: "true" for clean sentence-level timestamps, "false" for word-level
    """
    global aligner
    
    if not aligner:
        raise HTTPException(status_code=500, detail="WhisperX aligner not initialized")
    
    logger.info(f"Received alignment request - audio: {audio.filename}, text length: {len(text)}")
    try:
        # Use provided device or default
        current_device = device_param if device_param else device
        logger.info(f"Using device: {current_device}, model: {model}, language: {language}, clean: {clean}")
        
        # Save uploaded audio file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(audio.filename).suffix) as temp_file:
            shutil.copyfileobj(audio.file, temp_file)
            temp_audio_path = temp_file.name
            logger.info(f"Saved audio to temporary file: {temp_audio_path}")

        # Update aligner settings if different
        if aligner.device != current_device or aligner.model_name != model:
            logger.info(f"Updating aligner settings: device={current_device}, model={model}")
            aligner.device = current_device
            aligner.model_name = model
            aligner.model = None  # Force reload
            aligner.align_model = None

        # Determine which alignment method to use
        logger.info("Starting alignment process...")
        if clean.lower() == "true":
            # Generate clean sentence-level timestamps for image analysis
            result = aligner.generate_clean_timestamps(temp_audio_path, text)
        else:
            # Generate word-level timestamps for karaoke subtitles
            result = aligner.align_audio_with_text(temp_audio_path, text)
        
        logger.info(f"Alignment completed. Success: {result.get('success', False)}")

        # Clean up temp file
        os.unlink(temp_audio_path)
        logger.info("Temporary file cleaned up")

        if result["success"]:
            return JSONResponse(content=result, status_code=200)
        else:
            logger.error(f"Alignment failed: {result.get('error', 'Unknown error')}")
            raise HTTPException(status_code=500, detail=result["error"])

    except Exception as e:
        logger.error(f"Exception in align endpoint: {e}")
        logger.error(traceback.format_exc())
        print(f"ERROR in /align: {e}")
        print(traceback.format_exc())
        # Clean up temporary file if it exists
        if 'temp_audio_path' in locals():
            try:
                os.unlink(temp_audio_path)
            except:
                pass
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    device_param: str = Form(None),
    model: str = Form("base"),
    language: str = Form("en")
):
    """
    Transcribe audio and get word-level timestamps
    """
    global aligner
    
    if not aligner:
        raise HTTPException(status_code=500, detail="WhisperX aligner not initialized")
    
    logger.info(f"Received transcribe request - audio: {audio.filename}")
    try:
        # Use provided device or default
        current_device = device_param if device_param else device
        logger.info(f"Using device: {current_device}, model: {model}, language: {language}")
        
        # Save uploaded audio file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(audio.filename).suffix) as temp_file:
            shutil.copyfileobj(audio.file, temp_file)
            temp_audio_path = temp_file.name
            logger.info(f"Saved audio to temporary file: {temp_audio_path}")

        # Update aligner settings if different
        if aligner.device != current_device or aligner.model_name != model:
            logger.info(f"Updating aligner settings: device={current_device}, model={model}")
            aligner.device = current_device
            aligner.model_name = model
            aligner.model = None  # Force reload
            aligner.align_model = None

        # Perform transcription and alignment
        logger.info("Starting transcription and alignment process...")
        result = aligner.transcribe_and_align(temp_audio_path)
        logger.info(f"Transcription and alignment completed. Success: {result.get('success', False)}")

        # Clean up temp file
        os.unlink(temp_audio_path)
        logger.info("Temporary file cleaned up")

        if result["success"]:
            return JSONResponse(content=result, status_code=200)
        else:
            logger.error(f"Transcription and alignment failed: {result.get('error', 'Unknown error')}")
            raise HTTPException(status_code=500, detail=result["error"])

    except Exception as e:
        logger.error(f"Exception in transcribe endpoint: {e}")
        logger.error(traceback.format_exc())
        print(f"ERROR in /transcribe: {e}")
        print(traceback.format_exc())
        # Clean up temporary file if it exists
        if 'temp_audio_path' in locals():
            try:
                os.unlink(temp_audio_path)
            except:
                pass
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """
    Health check endpoint with detailed status
    """
    global aligner
    
    return {
        "status": "healthy", 
        "service": "WhisperX Timestamping API",
        "device": device,
        "cuda_available": torch.cuda.is_available(),
        "aligner_initialized": aligner is not None,
        "models_loaded": {
            "whisper_model": aligner.model is not None if aligner else False,
            "align_model": aligner.align_model is not None if aligner else False
        } if aligner else {"whisper_model": False, "align_model": False}
    }

@app.get("/status")
async def get_status():
    """
    Get current service status and loaded models
    """
    global aligner
    
    if not aligner:
        return {
            "aligner_initialized": False,
            "device": device,
            "model_name": None,
            "whisper_model_loaded": False,
            "align_model_loaded": False,
            "cuda_available": torch.cuda.is_available()
        }
    
    return {
        "aligner_initialized": True,
        "device": aligner.device,
        "model_name": aligner.model_name,
        "whisper_model_loaded": aligner.model is not None,
        "align_model_loaded": aligner.align_model is not None,
        "cuda_available": torch.cuda.is_available()
    }

@app.get("/")
async def root():
    """
    Root endpoint with API information
    """
    return {
        "message": "WhisperX Timestamping API",
        "description": "API for generating word-level and sentence-level timestamps using WhisperX",
        "version": "1.0.0",
        "device": device,
        "cuda_available": torch.cuda.is_available(),
        "endpoints": {
            "POST /align": "Align audio with reference text (supports clean sentence-level timestamps)",
            "POST /transcribe": "Transcribe and align audio to get word-level timestamps",
            "GET /health": "Health check with detailed status",
            "GET /status": "Get current service status and loaded models",
            "GET /": "API information"
        },
        "parameters": {
            "/align": {
                "audio": "Audio file to process",
                "text": "Reference text for alignment",
                "clean": "'true' for sentence-level, 'false' for word-level timestamps",
                "device_param": "Device to use (cpu/cuda)",
                "model": "WhisperX model size (base, small, medium, large)",
                "language": "Language code (default: en)"
            },
            "/transcribe": {
                "audio": "Audio file to transcribe",
                "device_param": "Device to use (cpu/cuda)",
                "model": "WhisperX model size (base, small, medium, large)",
                "language": "Language code (default: en)"
            }
        }
    }

if __name__ == "__main__":
    logger.info("Starting WhisperX Timestamping API server...")
    print("=" * 50)
    print("Starting WhisperX Timestamping API server...")
    print(f"Device: {device}")
    print(f"CUDA Available: {torch.cuda.is_available()}")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=6000)
