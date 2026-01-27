#!/usr/bin/env python3
"""
Standalone WhisperX alignment service
Communicates with Node.js via file I/O or HTTP
"""

import whisperx
import json
import sys
import os
import argparse
from pathlib import Path
import tempfile
import logging
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class WhisperXAligner:
    def __init__(self, device="cpu", model_name="base"):
        self.device = device
        self.model_name = model_name
        self.model = None
        self.align_model = None
        self.align_metadata = None
        logger.info(f"WhisperXAligner initialized with device={device}, model_name={model_name}")
        print(f"WhisperXAligner initialized with device={device}, model_name={model_name}")
        
    def load_models(self, language="en"):
        """Load WhisperX models"""
        logger.info(f"Loading WhisperX models on {self.device} for language {language}...")
        print(f"Loading WhisperX models on {self.device} for language {language}...", file=sys.stderr)
        
        try:
            # Load main model
            logger.info(f"Loading main model: {self.model_name}")
            print(f"Loading main model: {self.model_name}", file=sys.stderr)
            self.model = whisperx.load_model(self.model_name, self.device)
            logger.info("Main model loaded successfully")
            print("Main model loaded successfully", file=sys.stderr)
            
            # Load alignment model
            logger.info(f"Loading alignment model for language: {language}")
            print(f"Loading alignment model for language: {language}", file=sys.stderr)
            self.align_model, self.align_metadata = whisperx.load_align_model(
                language_code=language, 
                device=self.device
            )
            logger.info("Alignment model loaded successfully")
            print("Alignment model loaded successfully", file=sys.stderr)
            
            logger.info("All models loaded successfully")
            print("All models loaded successfully", file=sys.stderr)
            
        except Exception as e:
            logger.error(f"Error loading models: {e}")
            logger.error(traceback.format_exc())
            print(f"ERROR loading models: {e}", file=sys.stderr)
            print(traceback.format_exc(), file=sys.stderr)
            raise
    
    def align_audio_with_text(self, audio_path, reference_text):
        """
        Align audio with reference text to get word-level timestamps
        """
        logger.info(f"Starting alignment for audio: {audio_path}")
        print(f"Starting alignment for audio: {audio_path}")
        try:
            # Load audio
            logger.info("Loading audio file...")
            print("Loading audio file...")
            audio = whisperx.load_audio(audio_path)
            logger.info(f"Audio loaded successfully. Duration: {len(audio) / 16000:.2f} seconds")
            print(f"Audio loaded successfully. Duration: {len(audio) / 16000:.2f} seconds")
            
            # If models not loaded, load them
            if self.model is None or self.align_model is None:
                logger.info("Models not loaded, loading now...")
                print("Models not loaded, loading now...")
                self.load_models()
            
            # Create segments from reference text
            logger.info("Creating segments from reference text...")
            print("Creating segments from reference text...")
            segments = [{
                "start": 0,
                "end": len(audio) / 16000,  # WhisperX uses 16kHz
                "text": reference_text
            }]
            
            # Perform forced alignment
            logger.info("Performing forced alignment...")
            print("Performing forced alignment...")
            result = whisperx.align(
                segments, 
                self.align_model, 
                self.align_metadata, 
                audio, 
                self.device, 
                return_char_alignments=False
            )
            
            # Extract word-level timestamps
            logger.info("Extracting word-level timestamps...")
            print("Extracting word-level timestamps...")
            word_timestamps = []
            for segment in result.get("segments", []):
                for word in segment.get("words", []):
                    word_timestamps.append({
                        "word": word["word"].strip(),
                        "start": word["start"],
                        "end": word["end"],
                        "confidence": word.get("score", 1.0)
                    })
            
            logger.info(f"Alignment completed successfully. Found {len(word_timestamps)} words")
            print(f"Alignment completed successfully. Found {len(word_timestamps)} words")
            
            return {
                "success": True,
                "word_timestamps": word_timestamps,
                "total_duration": len(audio) / 16000
            }
            
        except Exception as e:
            logger.error(f"Error in align_audio_with_text: {e}")
            logger.error(traceback.format_exc())
            print(f"ERROR in align_audio_with_text: {e}")
            print(traceback.format_exc())
            return {
                "success": False,
                "error": str(e),
                "word_timestamps": []
            }
    
    def transcribe_and_align(self, audio_path):
        """
        Transcribe audio and get word-level timestamps
        """
        logger.info(f"Starting transcription and alignment for audio: {audio_path}")
        print(f"Starting transcription and alignment for audio: {audio_path}")
        try:
            # Load audio
            logger.info("Loading audio file...")
            print("Loading audio file...")
            audio = whisperx.load_audio(audio_path)
            logger.info(f"Audio loaded successfully. Duration: {len(audio) / 16000:.2f} seconds")
            print(f"Audio loaded successfully. Duration: {len(audio) / 16000:.2f} seconds")
            
            # If models not loaded, load them
            if self.model is None:
                logger.info("Main model not loaded, loading now...")
                print("Main model not loaded, loading now...")
                self.load_models()
            
            # Transcribe
            logger.info("Starting transcription...")
            print("Starting transcription...")
            result = self.model.transcribe(audio, batch_size=16)
            logger.info("Transcription completed")
            print("Transcription completed")
            
            # Align
            if self.align_model is None:
                logger.info("Alignment model not loaded, loading now...")
                print("Alignment model not loaded, loading now...")
                self.load_models()
                
            logger.info("Starting alignment...")
            print("Starting alignment...")
            aligned_result = whisperx.align(
                result["segments"], 
                self.align_model, 
                self.align_metadata, 
                audio, 
                self.device,
                return_char_alignments=False
            )
            
            # Extract results
            logger.info("Extracting results...")
            print("Extracting results...")
            transcription = " ".join([seg["text"] for seg in result["segments"]])
            word_timestamps = []
            
            for segment in aligned_result.get("segments", []):
                for word in segment.get("words", []):
                    word_timestamps.append({
                        "word": word["word"].strip(),
                        "start": word["start"],
                        "end": word["end"],
                        "confidence": word.get("score", 1.0)
                    })
            
            logger.info(f"Transcription and alignment completed successfully. Found {len(word_timestamps)} words")
            print(f"Transcription and alignment completed successfully. Found {len(word_timestamps)} words")
            
            return {
                "success": True,
                "transcription": transcription,
                "word_timestamps": word_timestamps,
                "total_duration": len(audio) / 16000
            }
            
        except Exception as e:
            logger.error(f"Error in transcribe_and_align: {e}")
            logger.error(traceback.format_exc())
            print(f"ERROR in transcribe_and_align: {e}")
            print(traceback.format_exc())
            return {
                "success": False,
                "error": str(e),
                "transcription": "",
                "word_timestamps": []
            }

    def generate_clean_timestamps(self, audio_path, reference_text):
        """
        Generate clean sentence-level timestamps for image analysis
        (not karaoke-style fragments)
        """
        logger.info(f"Generating clean timestamps for image analysis: {audio_path}")
        print(f"Generating clean timestamps for image analysis: {audio_path}")
        try:
            # Load audio
            audio = whisperx.load_audio(audio_path)
            
            # If models not loaded, load them
            if self.model is None or self.align_model is None:
                self.load_models()
            
            # Split reference text into sentences
            import re
            sentences = re.split(r'[.!?]+', reference_text)
            sentences = [s.strip() for s in sentences if s.strip()]
            
            # Create segments for each sentence
            segments = []
            current_time = 0
            audio_duration = len(audio) / 16000
            
            for i, sentence in enumerate(sentences):
                # Estimate sentence duration (rough approximation)
                word_count = len(sentence.split())
                estimated_duration = max(2.0, word_count * 0.4)  # ~0.4s per word
                
                start_time = current_time
                end_time = min(current_time + estimated_duration, audio_duration)
                
                segments.append({
                    "start": start_time,
                    "end": end_time,
                    "text": sentence
                })
                
                current_time = end_time
            
            # Perform forced alignment for each sentence
            logger.info("Performing sentence-level alignment...")
            print("Performing sentence-level alignment...")
            
            aligned_segments = []
            for segment in segments:
                try:
                    result = whisperx.align(
                        [segment], 
                        self.align_model, 
                        self.align_metadata, 
                        audio, 
                        self.device, 
                        return_char_alignments=False
                    )
                    
                    if result.get("segments"):
                        aligned_seg = result["segments"][0]
                        aligned_segments.append({
                            "start": aligned_seg["start"],
                            "end": aligned_seg["end"],
                            "text": aligned_seg["text"].strip()
                        })
                        logger.info(f"Aligned sentence: {aligned_seg['start']:.2f}-{aligned_seg['end']:.2f}s: '{aligned_seg['text'][:50]}...'")
                except Exception as e:
                    logger.warning(f"Failed to align sentence '{segment['text'][:30]}...': {e}")
                    # Use estimated timing as fallback
                    aligned_segments.append(segment)
            
            logger.info(f"Clean timestamp generation completed. {len(aligned_segments)} sentences aligned")
            print(f"Clean timestamp generation completed. {len(aligned_segments)} sentences aligned")
            
            return {
                "success": True,
                "sentences": aligned_segments,
                "total_duration": audio_duration
            }
            
        except Exception as e:
            logger.error(f"Error in generate_clean_timestamps: {e}")
            logger.error(traceback.format_exc())
            print(f"ERROR in generate_clean_timestamps: {e}")
            print(traceback.format_exc())
            return {
                "success": False,
                "error": str(e),
                "sentences": []
            }

def main():
    parser = argparse.ArgumentParser(description='WhisperX Alignment Service')
    parser.add_argument('--audio', required=True, help='Path to audio file')
    parser.add_argument('--text', help='Reference text for alignment')
    parser.add_argument('--output', required=True, help='Output JSON file path')
    parser.add_argument('--device', default='cpu', help='Device to use (cpu/cuda)')
    parser.add_argument('--model', default='base', help='WhisperX model size')
    parser.add_argument('--language', default='en', help='Language code')
    parser.add_argument('--clean', action='store_true', help='Generate clean sentence-level timestamps for image analysis')
    
    args = parser.parse_args()
    
    # Initialize aligner
    aligner = WhisperXAligner(device=args.device, model_name=args.model)
    
    # Process audio
    if args.clean and args.text:
        # Generate clean sentence-level timestamps for image analysis
        result = aligner.generate_clean_timestamps(args.audio, args.text)
    elif args.text:
        # Forced alignment with reference text
        result = aligner.align_audio_with_text(args.audio, args.text)
    else:
        # Transcribe and align
        result = aligner.transcribe_and_align(args.audio)
    
    # Save result to output file
    with open(args.output, 'w') as f:
        json.dump(result, f, indent=2)
    
    if result.get("success"):
        print(f"✅ Processing completed successfully. Results saved to: {args.output}")
        if args.clean:
            print(f"📊 Generated {len(result.get('sentences', []))} clean sentence timestamps")
        else:
            print(f"📊 Generated {len(result.get('word_timestamps', []))} word timestamps")
    else:
        print(f"❌ Processing failed: {result.get('error', 'Unknown error')}")
        sys.exit(1)