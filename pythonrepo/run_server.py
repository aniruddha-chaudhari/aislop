#!/usr/bin/env python3
"""
Script to run the WhisperX Timestamping API server
"""

import uvicorn
import os
import sys

if __name__ == "__main__":
    # Add current directory to Python path
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    print("Starting WhisperX Timestamping API server...")
    print("API will be available at: http://localhost:6000")
    print("Documentation at: http://localhost:6000/docs")

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=6000,
        reload=True,
        log_level="info"
    )
