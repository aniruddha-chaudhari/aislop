'use client';

import { useState, useRef } from 'react';

interface FileUploaderProps {
  onFileSelect: (file: File | null) => void;
  accept?: string;
  maxSize?: number; // in MB
  placeholder?: string;
  disabled?: boolean;
}

export default function FileUploader({
  onFileSelect,
  accept = "video/*",
  maxSize = 100,
  placeholder = "Choose a file or drag & drop",
  disabled = false
}: FileUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setError('');

    // Check file size
    if (file.size > maxSize * 1024 * 1024) {
      setError(`File size must be less than ${maxSize}MB`);
      return;
    }

    // Check file type
    if (accept !== "*" && !file.type.match(accept.replace('*', '.*'))) {
      setError('Invalid file type');
      return;
    }

    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setDragActive(true);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setDragActive(true);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (disabled) return;

    const files = e.target.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const onButtonClick = () => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full">
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragActive
            ? 'border-[#337EA9] bg-[#E7F3F8]'
            : disabled
            ? 'border-[#787774]/30 bg-[#787774]/10 cursor-not-allowed'
            : 'border-[#787774]/30 hover:border-[#337EA9]/50 cursor-pointer'
        }`}
        onDrop={handleDrop}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onClick={disabled ? undefined : onButtonClick}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          disabled={disabled}
          className="hidden"
        />

        <div className="space-y-4">
          <div className="text-4xl">
            {selectedFile ? '📁' : '📤'}
          </div>

          {selectedFile ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-[#F1F1EF]">
                {selectedFile.name}
              </p>
              <p className="text-xs text-[#787774]">
                {formatFileSize(selectedFile.size)}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                  onFileSelect(null);
                  setError('');
                }}
                className="text-xs text-[#D44C47] hover:text-[#D44C47]/80"
                disabled={disabled}
              >
                Remove file
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-[#787774]">
                {placeholder}
              </p>
              <p className="text-xs text-[#787774] mt-2">
                Max size: {maxSize}MB
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-2 text-sm text-[#D44C47]">
          {error}
        </p>
      )}
    </div>
  );
}
