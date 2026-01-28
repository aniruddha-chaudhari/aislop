'use client';

import { useState, useRef, useEffect } from 'react';
import { API_ENDPOINTS, API_BASE_URL } from '../../config/api';

interface UserProvidedImage {
  id: string;
  imagePath: string;
  label: string;
  description?: string;
  preferredTimestamp?: number;
  priority?: 'high' | 'medium' | 'low';
}

interface AudioFile {
  id: string;
  filename: string;
  path: string;
  fileSize: number;
  generatedAt: string;
  duration?: number;
}

interface Dialogue {
  id: string;
  text: string;
  character: string;
  order: number;
  audioFile: AudioFile | null;
}

interface AudioSession {
  sessionId: string;
  name?: string;
  dialogues: Dialogue[];
}

interface ImageUploadProps {
  onImagesChange: (images: UserProvidedImage[]) => void;
  userImages: UserProvidedImage[];
  disabled?: boolean;
  sessionId?: string;
}

// Format seconds into m:ss or h:mm:ss
function formatDurationLabel(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(secs).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Get audio duration from file (same as AudioBrowser)
const getAudioDuration = async (url: string): Promise<number> => {
  return new Promise<number>((resolve) => {
    const audio = new Audio();
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
    };
    const onLoaded = () => {
      const duration = audio.duration;
      cleanup();
      resolve(isFinite(duration) ? duration : 0);
    };
    const onError = () => {
      cleanup();
      resolve(0);
    };
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);
    audio.src = url;
  });
};

export default function ImageUpload({ onImagesChange, userImages, disabled = false, sessionId }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Conversation viewer state
  const [showConversation, setShowConversation] = useState(false);
  const [sessionData, setSessionData] = useState<AudioSession | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [conversationError, setConversationError] = useState('');
  const [dialogueOffsets, setDialogueOffsets] = useState<Record<string, number>>({});

  // Text selection state
  const [selectedText, setSelectedText] = useState('');
  const [uploadingSelected, setUploadingSelected] = useState(false);
  const selectedFileInputRef = useRef<HTMLInputElement>(null);

  // Fetch session conversation data
  const fetchSessionConversation = async () => {
    if (!sessionId) return;

    setLoadingConversation(true);
    setConversationError('');

    try {
      const response = await fetch(API_ENDPOINTS.audio);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        const session = data.sessions.find((s: AudioSession) => s.sessionId === sessionId);
        if (session) {
          setSessionData(session);

          // Calculate actual cumulative timestamps (same logic as AudioBrowser)
          const dialoguesWithAudio = session.dialogues.filter((d: Dialogue) => !!d.audioFile);

          // Determine per-dialogue durations (using backend first)
          const durations: number[] = new Array(dialoguesWithAudio.length).fill(0);
          const pending: { index: number; promise: Promise<number> }[] = [];

          dialoguesWithAudio.forEach((d: Dialogue, idx: number) => {
            const backendDuration = typeof d.audioFile!.duration === 'number' ? d.audioFile!.duration : 0;
            if (backendDuration && isFinite(backendDuration)) {
              durations[idx] = Math.max(0, backendDuration);
            } else {
              const url = `${API_BASE_URL}/api/audio/download/${d.audioFile!.filename}?sessionId=${sessionId}`;
              pending.push({ index: idx, promise: getAudioDuration(url) });
            }
          });

          if (pending.length > 0) {
            const results = await Promise.all(pending.map(p => p.promise));
            results.forEach((value, i) => {
              const idx = pending[i].index;
              durations[idx] = Math.max(0, isFinite(value) ? value : 0);
            });
          }

          // Compute cumulative offsets per dialogue id
          let cumulative = 0;
          const offsetsForSession: Record<string, number> = {};
          dialoguesWithAudio.forEach((d: Dialogue, idx: number) => {
            offsetsForSession[d.id] = Math.floor(cumulative);
            cumulative += durations[idx];
          });

          setDialogueOffsets(offsetsForSession);
        } else {
          setConversationError('Session not found');
        }
      }
    } catch (error) {
      console.error('Error fetching session conversation:', error);
      setConversationError('Failed to load conversation');
    } finally {
      setLoadingConversation(false);
    }
  };

  // Load conversation when show is toggled
  useEffect(() => {
    if (showConversation && !sessionData) {
      fetchSessionConversation();
    }
  }, [showConversation]);

  // Handle selected text image upload
  const handleSelectedTextImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      // If no files selected (user cancelled), don't hide the button immediately
      return;
    }

    if (!selectedText) return;

    setUploadingSelected(true);
    setError('');
    setSuccess('');

    const newImages: UserProvidedImage[] = [];

    for (const file of Array.from(files)) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError(`File "${file.name}" is not an image. Please select image files only.`);
        continue;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError(`File "${file.name}" is too large. Maximum size is 10MB.`);
        continue;
      }

      try {
        // Create userImage object with selected text as label
        const tempUserImage: {
          label: string;
          description?: string;
          priority: 'high' | 'medium' | 'low';
          preferredTimestamp?: number;
        } = {
          label: selectedText, // Use full selected text as label
          description: `Image for: "${selectedText}"`,
          priority: 'high' as const, // Higher priority for manually selected text
        };

        const formData = new FormData();
        formData.append('image', file);
        formData.append('sessionId', sessionId || 'temp_session');
        formData.append('label', tempUserImage.label);
        if (tempUserImage.description) {
          formData.append('description', tempUserImage.description);
        }
        formData.append('priority', tempUserImage.priority);

        const response = await fetch(API_ENDPOINTS.uploadUserImage, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to upload ${file.name}`);
        }

        const data = await response.json();

        // Create user image object with server response
        const uploadedImage: UserProvidedImage = {
          id: data.userImage.id,
          imagePath: data.userImage.imagePath,
          label: data.userImage.label,
          description: data.userImage.description,
          preferredTimestamp: data.userImage.preferredTimestamp,
          priority: data.userImage.priority
        };

        newImages.push(uploadedImage);
        setSuccess(`Successfully uploaded image for: "${selectedText.length > 100 ? selectedText.substring(0, 100) + '...' : selectedText}"`);
      } catch (err) {
        console.error('Upload error:', err);
        setError(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (newImages.length > 0) {
      onImagesChange([...userImages, ...newImages]);
    }

    setUploadingSelected(false);

    // Clear the file input
    if (selectedFileInputRef.current) {
      selectedFileInputRef.current.value = '';
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError('');
    setSuccess('');

    const newImages: UserProvidedImage[] = [];

    for (const file of Array.from(files)) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError(`File "${file.name}" is not an image. Please select image files only.`);
        continue;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError(`File "${file.name}" is too large. Maximum size is 10MB.`);
        continue;
      }

      try {
        // Create a temporary userImage object with default values
        const tempUserImage: {
          label: string;
          description?: string;
          priority: 'high' | 'medium' | 'low';
          preferredTimestamp?: number;
        } = {
          label: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
          description: `User uploaded image: ${file.name}`,
          priority: 'medium' as const,
        };

        const formData = new FormData();
        formData.append('image', file);
        formData.append('sessionId', sessionId || 'temp_session');
        formData.append('label', tempUserImage.label);
        if (tempUserImage.description) {
          formData.append('description', tempUserImage.description);
        }
        if (tempUserImage.preferredTimestamp !== undefined) {
          formData.append('preferredTimestamp', tempUserImage.preferredTimestamp.toString());
        }
        formData.append('priority', tempUserImage.priority);

        const response = await fetch(API_ENDPOINTS.uploadUserImage, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to upload ${file.name}`);
        }

        const data = await response.json();

        // Create user image object with server response
        const uploadedImage: UserProvidedImage = {
          id: data.userImage.id,
          imagePath: data.userImage.imagePath,
          label: data.userImage.label,
          description: data.userImage.description,
          preferredTimestamp: data.userImage.preferredTimestamp,
          priority: data.userImage.priority
        };

        newImages.push(uploadedImage);
        setSuccess(`Successfully uploaded ${file.name}`);
      } catch (err) {
        console.error('Upload error:', err);
        setError(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (newImages.length > 0) {
      onImagesChange([...userImages, ...newImages]);
    }

    setUploading(false);

    // Clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (imageId: string) => {
    const updatedImages = userImages.filter(img => img.id !== imageId);
    onImagesChange(updatedImages);
  };

  const handleLabelChange = async (imageId: string, newLabel: string) => {
    // Update local state immediately for responsive UI
    const updatedImages = userImages.map(img =>
      img.id === imageId ? { ...img, label: newLabel } : img
    );
    onImagesChange(updatedImages);

    // Send update to server
    try {
      const response = await fetch(`${API_ENDPOINTS.userImages}/${sessionId || 'temp_session'}/${imageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          label: newLabel,
          description: userImages.find(img => img.id === imageId)?.description,
          priority: userImages.find(img => img.id === imageId)?.priority,
          preferredTimestamp: userImages.find(img => img.id === imageId)?.preferredTimestamp
        }),
      });

      if (!response.ok) {
        console.warn('Failed to update image label on server');
      }
    } catch (error) {
      console.warn('Error updating image label on server:', error);
    }
  };

  const handleDescriptionChange = async (imageId: string, newDescription: string) => {
    // Update local state immediately for responsive UI
    const updatedImages = userImages.map(img =>
      img.id === imageId ? { ...img, description: newDescription } : img
    );
    onImagesChange(updatedImages);

    // Send update to server
    try {
      const response = await fetch(`${API_ENDPOINTS.userImages}/${sessionId || 'temp_session'}/${imageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          label: userImages.find(img => img.id === imageId)?.label,
          description: newDescription,
          priority: userImages.find(img => img.id === imageId)?.priority,
          preferredTimestamp: userImages.find(img => img.id === imageId)?.preferredTimestamp
        }),
      });

      if (!response.ok) {
        console.warn('Failed to update image description on server');
      }
    } catch (error) {
      console.warn('Error updating image description on server:', error);
    }
  };

  const handlePriorityChange = async (imageId: string, newPriority: 'high' | 'medium' | 'low') => {
    // Update local state immediately for responsive UI
    const updatedImages = userImages.map(img =>
      img.id === imageId ? { ...img, priority: newPriority } : img
    );
    onImagesChange(updatedImages);

    // Send update to server
    try {
      const response = await fetch(`${API_ENDPOINTS.userImages}/${sessionId || 'temp_session'}/${imageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          label: userImages.find(img => img.id === imageId)?.label,
          description: userImages.find(img => img.id === imageId)?.description,
          priority: newPriority,
          preferredTimestamp: userImages.find(img => img.id === imageId)?.preferredTimestamp
        }),
      });

      if (!response.ok) {
        console.warn('Failed to update image priority on server');
      }
    } catch (error) {
      console.warn('Error updating image priority on server:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-[#E7F3F8] border border-[#337EA9]/20 rounded-md">
        <h3 className="text-lg font-semibold text-[#337EA9] mb-2">
          📸 Upload Your Own Images (Optional)
        </h3>
        <p className="text-[#37352F] text-sm mb-3">
          Upload educational images related to your topic. Our AI will evaluate them for relevance and may include them in the video.
        </p>

        <div className="flex items-center space-x-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            disabled={disabled || uploading}
            className="hidden"
            id="image-upload"
          />
          <label
            htmlFor="image-upload"
            className={`px-4 py-2 bg-[#337EA9] hover:bg-[#337EA9]/80 disabled:bg-[#787774]/50 text-[#F1F1EF] font-medium rounded-md transition-colors cursor-pointer ${disabled || uploading ? 'cursor-not-allowed' : ''
              }`}
          >
            {uploading ? 'Uploading...' : 'Choose Images'}
          </label>
          <span className="text-sm text-[#787774]">
            Max 10MB per image • PNG, JPG, GIF supported
          </span>
        </div>
      </div>

      {/* Conversation Viewer */}
      {sessionId && (
        <div className="p-4 bg-[#2F3438] border border-[#787774]/30 rounded-md">
          <button
            onClick={() => setShowConversation(!showConversation)}
            className="flex items-center justify-between w-full text-left"
          >
            <div>
              <h3 className="text-lg font-semibold text-[#F1F1EF] mb-1">
                💬 View Conversation
              </h3>
              <p className="text-[#787774] text-sm">
                Review the dialogue content to help choose relevant images
              </p>
            </div>
            <span className="text-[#F1F1EF] ml-2 flex-shrink-0 text-xl">
              {showConversation ? '▼' : '▶'}
            </span>
          </button>

          {showConversation && (
            <div className="mt-4 pt-4 border-t border-[#787774]/30">
              {loadingConversation && (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#337EA9] border-t-transparent mx-auto mb-2"></div>
                  <p className="text-[#787774]">Loading conversation...</p>
                </div>
              )}

              {conversationError && (
                <div className="p-3 bg-[#FDEBEC] border border-[#D44C47]/20 rounded-md">
                  <p className="text-[#D44C47] text-sm">{conversationError}</p>
                </div>
              )}

              {sessionData && (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {sessionData.dialogues.map((dialogue) => (
                    <div
                      key={dialogue.id}
                      className={`conversation-dialogue p-3 rounded-lg border-l-4 ${dialogue.character === 'Stewie'
                          ? 'bg-purple-900/20 border-purple-400'
                          : dialogue.character === 'Peter'
                            ? 'bg-green-900/20 border-green-400'
                            : 'bg-gray-700 border-gray-400'
                        }`}
                    >
                      <div className="flex items-start space-x-3 mb-2">
                        <span className="text-lg flex-shrink-0">
                          {dialogue.character === 'Stewie' ? '👶' : dialogue.character === 'Peter' ? '👨' : '🎵'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className={`font-semibold text-sm ${dialogue.character === 'Stewie'
                                ? 'text-purple-300'
                                : dialogue.character === 'Peter'
                                  ? 'text-green-300'
                                  : 'text-gray-300'
                              }`}>
                              {dialogue.character} - Line {dialogue.order}
                            </p>
                            <span className="text-xs text-[#787774] flex-shrink-0 ml-2">
                              ⏱️ {formatDurationLabel(dialogueOffsets[dialogue.id] || 0)}
                            </span>
                          </div>
                          <p
                            className="text-[#F1F1EF] italic text-sm mt-1 break-words select-text cursor-text user-select-all"
                            style={{ userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text' }}
                          >
                            &ldquo;{dialogue.text}&rdquo;
                          </p>
                          <div className="text-xs text-[#787774] mt-2 opacity-70">
                            💡 Select any text above to upload a related image
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Manual Upload Button for Selected Text */}
              <div className="mt-4 p-3 bg-[#2A2B2A] rounded-lg border border-[#444444]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">📸</span>
                  <span className="text-[#F1F1EF] text-sm font-medium">Upload Image for Selected Text</span>
                </div>
                <p className="text-xs text-[#787774] mb-3">
                  First select any text from the dialogue above, then click the button below to upload an image for that text.
                </p>

                {/* Hidden file input for direct upload */}
                <input
                  ref={selectedFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleSelectedTextImageUpload}
                  disabled={disabled || uploadingSelected}
                  className="hidden"
                />

                <button
                  onClick={() => {
                    const selection = window.getSelection();
                    if (selection && selection.toString().trim().length > 0) {
                      setSelectedText(selection.toString().trim());
                      // Directly trigger file input
                      if (selectedFileInputRef.current) {
                        selectedFileInputRef.current.click();
                      }
                    } else {
                      alert('Please select some text from the dialogue above first.');
                    }
                  }}
                  disabled={disabled || uploadingSelected}
                  className={`w-full px-4 py-2 bg-[#337EA9] hover:bg-[#2A6B94] text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${disabled || uploadingSelected ? 'cursor-not-allowed opacity-50' : ''
                    }`}
                >
                  {uploadingSelected ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <span>📤</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error/Success Messages */}
      {error && (
        <div className="p-3 bg-[#FDEBEC] border border-[#D44C47]/20 rounded-md">
          <p className="text-[#D44C47] text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-3 bg-[#EDF3EC] border border-[#448361]/20 rounded-md">
          <p className="text-[#448361] text-sm">{success}</p>
        </div>
      )}

      {/* Uploaded Images List */}
      {userImages.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-md font-semibold text-[#F1F1EF]">
            Your Uploaded Images ({userImages.length})
          </h4>

          {userImages.map((image) => (
            <div
              key={image.id}
              className="p-3 sm:p-4 bg-[#2F3438] border border-[#787774]/30 rounded-md"
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-3">
                <div className="flex-1">
                  <div className="mb-2">
                    <label className="block text-sm font-medium text-[#F1F1EF] mb-1">
                      Image Label (for AI evaluation)
                    </label>
                    <input
                      type="text"
                      value={image.label}
                      onChange={(e) => handleLabelChange(image.id, e.target.value)}
                      className="w-full px-3 py-2 border border-[#787774]/30 bg-[#2F3438] text-[#F1F1EF] rounded-md focus:ring-2 focus:ring-[#337EA9] focus:border-[#337EA9] placeholder-[#787774]"
                      placeholder="e.g., Docker Architecture Diagram"
                      disabled={disabled}
                    />
                  </div>

                  <div className="mb-2">
                    <label className="block text-sm font-medium text-[#F1F1EF] mb-1">
                      Description (optional)
                    </label>
                    <textarea
                      value={image.description || ''}
                      onChange={(e) => handleDescriptionChange(image.id, e.target.value)}
                      className="w-full px-3 py-2 border border-[#787774]/30 bg-[#2F3438] text-[#F1F1EF] rounded-md focus:ring-2 focus:ring-[#337EA9] focus:border-[#337EA9] resize-none placeholder-[#787774]"
                      rows={2}
                      placeholder="Describe what this image shows..."
                      disabled={disabled}
                    />
                  </div>

                  <div className="flex items-center space-x-4">
                    <div>
                      <label className="block text-sm font-medium text-[#F1F1EF] mb-1">
                        Priority
                      </label>
                      <select
                        value={image.priority || 'medium'}
                        onChange={(e) => handlePriorityChange(image.id, e.target.value as 'high' | 'medium' | 'low')}
                        className="px-3 py-2 border border-[#787774]/30 bg-[#2F3438] text-[#F1F1EF] rounded-md focus:ring-2 focus:ring-[#337EA9] focus:border-[#337EA9]"
                        disabled={disabled}
                      >
                        <option value="high">High - Very relevant</option>
                        <option value="medium">Medium - Somewhat relevant</option>
                        <option value="low">Low - Nice to have</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleRemoveImage(image.id)}
                  disabled={disabled}
                  className="px-3 py-2 bg-[#D44C47] hover:bg-[#D44C47]/80 disabled:bg-[#787774]/50 text-[#F1F1EF] text-xs sm:text-sm rounded-md transition-colors flex-shrink-0 self-start"
                  title="Remove image"
                >
                  🗑️<span className="hidden sm:inline ml-1">Remove</span>
                </button>
              </div>

              <div className="text-xs text-[#787774]">
                File: {image.imagePath.split('/').pop()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
