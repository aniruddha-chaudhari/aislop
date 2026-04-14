'use client';

import { useState, useEffect, useRef } from 'react';
import { API_ENDPOINTS, API_BASE_URL } from '../../config/api';
import ImageUpload from './ImageUpload';

interface ConversationItem {
  character: string;
  dialogue: string;
}

interface VideoStyleOption {
  id: string;
  name: string;
  description: string;
  characterSet?: 'single' | 'duo';
  defaultCharacter?: string;
  supportedCharacters?: string[];
}

interface AudioGenerationConfigResponse {
  success: boolean;
  styles?: VideoStyleOption[];
  characters?: string[];
  defaults?: {
    videoStyle?: string;
    singleVoiceCharacter?: string;
  };
}

interface UserProvidedImage {
  id: string;
  imagePath: string;
  label: string;
  description?: string;
  preferredTimestamp?: number;
  priority?: 'high' | 'medium' | 'low';
}

interface ScriptResponse {
  success: boolean;
  data: {
    conversation: ConversationItem[];
    topic: string;
  };
  parameters?: {
    exaggeration: number;
    temperature: number;
    seedNum: number;
    cfgWeight: number;
    minP: number;
    topP: number;
    repetitionPenalty: number;
  };
}

interface VideoResponse {
  success: boolean;
  videoPath?: string;
  error?: string;
  audioFiles?: Array<{ path: string; filename: string }>;
  sessionId?: string;
  userImageDecisions?: Array<{
    userImageLabel: string;
    useImage: boolean;
    reasoning: string;
    timestamp?: number;
  }>;
  userImagesSummary?: {
    totalProvided: number;
    accepted: number;
    rejected: number;
  };
}

type AppStep = 'input' | 'script-review' | 'audio-generation' | 'video-generation';

export default function ConversationGenerator() {
  const [prompt, setPrompt] = useState('');
  const [currentStep, setCurrentStep] = useState<AppStep>('input');
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [topic, setTopic] = useState('');
  const [audioFiles, setAudioFiles] = useState<Array<{ path: string; filename: string }>>([]);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState(() => {
    // Try to get sessionId from localStorage, fallback to empty string
    if (typeof window !== 'undefined') {
      return localStorage.getItem('audioSessionId') || '';
    }
    return '';
  });
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [showRegenerateDropdown, setShowRegenerateDropdown] = useState<number | null>(null);
  const [regenerateParams, setRegenerateParams] = useState({
    exaggeration: 0.7,
    temperature: 1.5,
    seedNum: 0,
    cfgWeight: 0.4,
    minP: 0.05,
    topP: 1.0,
    repetitionPenalty: 1.2
  });
  const [videoStyles, setVideoStyles] = useState<VideoStyleOption[]>([
    {
      id: 'standard',
      name: 'Stewie + Peter',
      description: 'Two-character educational dialogue',
      characterSet: 'duo',
      supportedCharacters: ['Stewie', 'Peter'],
    },
    {
      id: 'single_voice',
      name: 'Single Voice Character',
      description: 'Single-speaker educational reel script',
      characterSet: 'single',
      defaultCharacter: 'Narrator',
      supportedCharacters: ['Narrator', 'Stewie', 'Peter'],
    },
  ]);
  const [videoStyle, setVideoStyle] = useState<string>('standard');
  const [availableCharacters, setAvailableCharacters] = useState<string[]>(['Stewie', 'Peter', 'Narrator']);
  const [singleVoiceCharacter, setSingleVoiceCharacter] = useState<string>('Narrator');
  const [narratorReferenceAudio, setNarratorReferenceAudio] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('narratorReferenceAudio') || '';
  });
  const [referenceAudioOptions, setReferenceAudioOptions] = useState<Array<{ filename: string; path: string }>>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string>('Stewie');
  const [ttsParameters, setTtsParameters] = useState({
    exaggeration: 0.7,
    temperature: 1.5,
    seedNum: 0,
    cfgWeight: 0.4,
    minP: 0.05,
    topP: 1.0,
    repetitionPenalty: 1.2
  });
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [jsonImportText, setJsonImportText] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [userImages, setUserImages] = useState<UserProvidedImage[]>([]);
  const [generationProgress, setGenerationProgress] = useState<{
    total: number;
    completed: number;
    files: Array<{ fileId: string; filename: string; path?: string; status: 'generating' | 'completed' | 'error' }>;
  } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [userImageDecisions, setUserImageDecisions] = useState<Array<{
    userImageLabel: string;
    useImage: boolean;
    reasoning: string;
    timestamp?: number;
  }>>([]);
  const isSingleVoiceStyle = videoStyle === 'single_voice';
  const activeCharacters = availableCharacters.length > 0 ? availableCharacters : ['Stewie', 'Peter', 'Narrator'];

  const getCharacterTheme = (character: string): { border: string; text: string; bubble: string } => {
    if (character === 'Stewie') {
      return {
        border: 'border-purple-400',
        text: 'text-purple-300',
        bubble: 'bg-purple-50 dark:bg-purple-900/20 border-purple-400',
      };
    }
    if (character === 'Peter') {
      return {
        border: 'border-emerald-400',
        text: 'text-emerald-300',
        bubble: 'bg-green-50 dark:bg-green-900/20 border-green-400',
      };
    }
    return {
      border: 'border-sky-400',
      text: 'text-sky-300',
      bubble: 'bg-sky-50 dark:bg-sky-900/20 border-sky-400',
    };
  };

  useEffect(() => {
    const loadAudioConfig = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.audioConfig, { method: 'GET' });
        if (!response.ok) return;
        const data = (await response.json()) as AudioGenerationConfigResponse;
        if (!data.success) return;

        if (Array.isArray(data.styles) && data.styles.length > 0) {
          setVideoStyles(data.styles);
        }
        if (Array.isArray(data.characters) && data.characters.length > 0) {
          setAvailableCharacters(data.characters);
          if (!data.characters.includes(selectedCharacter)) {
            setSelectedCharacter(data.characters[0]);
          }
        }
        if (data.defaults?.videoStyle) {
          setVideoStyle(data.defaults.videoStyle);
        }
        if (data.defaults?.singleVoiceCharacter) {
          setSingleVoiceCharacter(data.defaults.singleVoiceCharacter);
        }
      } catch {
        // Use local fallback options when config endpoint is unavailable.
      }
    };

    loadAudioConfig();
  }, []);

  useEffect(() => {
    const loadReferenceAudio = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.referenceAudio, { method: 'GET' });
        if (!res.ok) return;
        const data = await res.json();
        const assets = Array.isArray(data?.assets) ? data.assets : [];
        const normalized = assets
          .map((a: any) => ({ filename: String(a?.filename || ''), path: String(a?.path || '') }))
          .filter((a: any) => a.filename);
        setReferenceAudioOptions(normalized);
      } catch {
        // ignore
      }
    };
    loadReferenceAudio();
  }, []);

  useEffect(() => {
    if (isSingleVoiceStyle) {
      setSelectedCharacter(singleVoiceCharacter);
    }
  }, [isSingleVoiceStyle, singleVoiceCharacter]);

  const handleGenerateScript = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMessage('');
    setConversation([]);
    setAudioFiles([]);

    try {
      const response = await fetch(API_ENDPOINTS.script, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          text: prompt.trim(),
          videoStyle,
          characterSet: isSingleVoiceStyle ? 'single' : 'duo',
          character: isSingleVoiceStyle ? singleVoiceCharacter : undefined,
          exaggeration: 0.7,
          temperature: 1.5,
          seedNum: 0,
          cfgWeight: 0.4,
          minP: 0.05,
          topP: 1.0,
          repetitionPenalty: 1.2
        }),
        mode: 'cors',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();

      if (data.success) {
        const generatedConversation: ConversationItem[] = (data.data?.conversation || []).map((rawItem: unknown) => {
          const item = (rawItem || {}) as { character?: string; dialogue?: string; text?: string };
          if (typeof item?.dialogue === 'string') {
            return {
              character: typeof item.character === 'string'
                ? item.character
                : (isSingleVoiceStyle ? singleVoiceCharacter : selectedCharacter),
              dialogue: item.dialogue,
            };
          }
          return {
            character: typeof item?.character === 'string'
              ? item.character
              : (isSingleVoiceStyle ? singleVoiceCharacter : selectedCharacter),
            dialogue: typeof item?.text === 'string' ? item.text : '',
          };
        });

        setConversation(generatedConversation);
        setTopic(data.data.topic);
        setAudioFiles(data.audioFiles || []);
        setSessionId(data.sessionId || `session_${Date.now()}`);
        if (isSingleVoiceStyle && data.selectedCharacter) {
          setSingleVoiceCharacter(data.selectedCharacter);
        }
        if (data.sessionId) {
          localStorage.setItem('audioSessionId', data.sessionId);
        }
        // Store TTS parameters from response or use defaults
        if (data.parameters) {
          setTtsParameters(data.parameters);
        }
        setCurrentStep('script-review');
      } else {
        setError('Failed to generate conversation script');
      }
    } catch (error) {
      setError('Failed to connect to server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const checkTTSConnection = async (): Promise<boolean> => {
    try {
      const response = await fetch(API_ENDPOINTS.testTTSConnection, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      const data = await response.json();
      return data.success === true;
    } catch (error) {
      return false;
    }
  };

  const handleApproveAndGenerateAudio = async () => {
    setLoading(true);
    setError('');
    setSuccessMessage('');

    // If audio files are already generated, skip API call
    if (audioFiles.length > 0) {
      setCurrentStep('audio-generation');
      setLoading(false);
      return;
    }

    // Check TTS connection before attempting to generate audio
    const ttsConnected = await checkTTSConnection();
    if (!ttsConnected) {
      setError('TTS API is not available. Please ensure the Chatterbox TTS server is running on port 8000.\n\nYou can start it by running: cd F:\\Aniruddha\\AI\\chatterbox && .venv\\Scripts\\Activate.ps1 && python fastapi_tts_server.py');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.audioFromScript, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          conversation: {
            conversation,
            topic,
            videoStyle,
            characterSet: isSingleVoiceStyle ? 'single' : 'duo',
            selectedCharacter: isSingleVoiceStyle ? singleVoiceCharacter : undefined,
          },
          videoStyle,
          characterSet: isSingleVoiceStyle ? 'single' : 'duo',
          character: isSingleVoiceStyle ? singleVoiceCharacter : undefined,
          narratorReferenceAudio: isSingleVoiceStyle && singleVoiceCharacter === 'Narrator' ? narratorReferenceAudio : undefined,
          ...ttsParameters
        }),
        mode: 'cors',
        credentials: 'include',
      });

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
          // Add suggestion if available
          if (errorData.suggestion) {
            errorMessage += `\n\n${errorData.suggestion}`;
          }
        } catch {
          // If JSON parsing fails, try text
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.success) {
        const newSessionId = data.sessionId || sessionId;

        setSessionId(newSessionId);
        if (newSessionId) {
          localStorage.setItem('audioSessionId', newSessionId);
        }
        
        // Initialize progress tracking
        setGenerationProgress({
          total: conversation.length,
          completed: 0,
          files: []
        });
        
        // Connect to SSE stream FIRST, then navigate to page
        // This ensures SSE connection is established before any messages are published
        if (data.streamEndpoint && newSessionId) {
          connectToStream(newSessionId);
          
          // Small delay to ensure SSE connection is established
          setTimeout(() => {
            setCurrentStep('audio-generation');
            setLoading(false);
          }, 200);
        } else if (data.audioFiles) {
          // Fallback: if streamEndpoint not provided, use old behavior
          setAudioFiles(data.audioFiles || []);
          setCurrentStep('audio-generation');
          setLoading(false);
        } else {
          setCurrentStep('audio-generation');
          setLoading(false);
        }
      } else {
        setError('Failed to generate audio files');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate audio. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleEditScript = (index: number, newDialogue: string) => {
    const updatedConversation = [...conversation];
    updatedConversation[index].dialogue = newDialogue;
    setConversation(updatedConversation);
  };

  const handleAddDialogue = () => {
    const character = isSingleVoiceStyle ? singleVoiceCharacter : selectedCharacter;
    const newItem: ConversationItem = { character, dialogue: '' };
    setConversation([...conversation, newItem]);
  };

  const handleDeleteDialogue = (index: number) => {
    const updatedConversation = conversation.filter((_, i) => i !== index);
    setConversation(updatedConversation);
  };

  // Connect to SSE stream for real-time file updates
  const connectToStream = (sessionId: string) => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const streamUrl = API_ENDPOINTS.streamFileUpdates(sessionId);

    try {
      const eventSource = new EventSource(streamUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {};

      eventSource.onmessage = (event) => {
      try {
        // Skip heartbeat messages
        if (event.data.startsWith(':')) {
          return;
        }

        const update = JSON.parse(event.data);

        if (update.type === 'started') {
          const total = update.total || conversation.length;
          setGenerationProgress({
            total,
            completed: 0,
            files: new Array(total).fill(null).map((_, i) => ({
              fileId: '',
              filename: '',
              status: 'waiting' as const
            }))
          });
        } else if (update.type === 'progress') {
          setGenerationProgress(prev => {
            if (!prev) return prev;
            // Extract index from fileId (format: sessionId_index)
            const fileIdMatch = update.fileId?.match(/_(\d+)$/);
            const fileIndex = fileIdMatch ? parseInt(fileIdMatch[1], 10) - 1 : -1;
            
            if (fileIndex >= 0 && fileIndex < prev.files.length) {
              const newFiles = [...prev.files];
              newFiles[fileIndex] = {
                fileId: update.fileId || '',
                filename: update.filename || '',
                status: 'generating'
              };
              return {
                ...prev,
                files: newFiles
              };
            }
            
            // Fallback: find by fileId
            const existingFileIndex = prev.files.findIndex(f => f.fileId === update.fileId);
            const newFiles = [...prev.files];
            if (existingFileIndex >= 0) {
              newFiles[existingFileIndex] = {
                ...newFiles[existingFileIndex],
                status: 'generating'
              };
            }
            return {
              ...prev,
              files: newFiles
            };
          });
        } else if (update.type === 'completed') {
          setGenerationProgress(prev => {
            if (!prev) return prev;
            // Extract index from fileId (format: sessionId_index)
            const fileIdMatch = update.fileId?.match(/_(\d+)$/);
            const fileIndex = fileIdMatch ? parseInt(fileIdMatch[1], 10) - 1 : -1;
            
            if (fileIndex >= 0 && fileIndex < prev.files.length) {
              const newFiles = [...prev.files];
              newFiles[fileIndex] = {
                fileId: update.fileId || '',
                filename: update.filename || '',
                path: update.path,
                status: 'completed'
              };
              
              // Update audioFiles state with completed file
              setAudioFiles(prevFiles => {
                const fileExists = prevFiles.some(f => f.filename === update.filename);
                if (!fileExists && update.path) {
                  return [...prevFiles, {
                    path: update.path,
                    filename: update.filename || ''
                  }];
                }
                return prevFiles;
              });
              
              return {
                ...prev,
                completed: update.completedCount || update.progress || prev.completed + 1,
                files: newFiles
              };
            }
            
            // Fallback: find by fileId
            const existingFileIndex = prev.files.findIndex(f => f.fileId === update.fileId);
            const newFiles = [...prev.files];
            if (existingFileIndex >= 0) {
              newFiles[existingFileIndex] = {
                fileId: update.fileId || '',
                filename: update.filename || '',
                path: update.path,
                status: 'completed'
              };
            }
            
            // Update audioFiles state with completed file
            setAudioFiles(prevFiles => {
              const fileExists = prevFiles.some(f => f.filename === update.filename);
              if (!fileExists && update.path) {
                return [...prevFiles, {
                  path: update.path,
                  filename: update.filename || ''
                }];
              }
              return prevFiles;
            });
            
            return {
              ...prev,
              completed: update.completedCount || update.progress || prev.completed + 1,
              files: newFiles
            };
          });
        } else if (update.type === 'error') {
          setGenerationProgress(prev => {
            if (!prev) return prev;
            const existingFileIndex = prev.files.findIndex(f => f.fileId === update.fileId);
            const newFiles = [...prev.files];
            
            if (existingFileIndex >= 0) {
              newFiles[existingFileIndex] = {
                ...newFiles[existingFileIndex],
                status: 'error'
              };
            } else {
              newFiles.push({
                fileId: update.fileId || '',
                filename: update.filename || '',
                status: 'error'
              });
            }
            
            return {
              ...prev,
              files: newFiles
            };
          });
          setError(`Error generating ${update.filename}: ${update.error}`);
        }
      } catch (error) {
      }
    };

      eventSource.onerror = () => {
        // EventSource.readyState: 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
        if (eventSource.readyState === EventSource.CLOSED) {
          setTimeout(() => {
            if (sessionId) {
              connectToStream(sessionId);
            }
          }, 3000);
        }
      };
    } catch (error) {
    }
  };

  // Cleanup EventSource on unmount or restart
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const handleRestart = () => {
    // Close SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    setCurrentStep('input');
    setConversation([]);
    setTopic('');
    setPrompt('');
    setAudioFiles([]);
    setError('');
    setSuccessMessage('');
    setSessionId('');
    setUserImages([]);
    setGenerationProgress(null);
    setVideoStyle('standard');
    setSingleVoiceCharacter('Narrator');
    setSelectedCharacter('Stewie');
    localStorage.removeItem('audioSessionId');
    setTtsParameters({
      exaggeration: 0.7,
      temperature: 1.5,
      seedNum: 0,
      cfgWeight: 0.4,
      minP: 0.05,
      topP: 1.0,
      repetitionPenalty: 1.2
    });
    setShowJsonImport(false);
    setJsonImportText('');
  };

  const handleGenerateVideo = async () => {
    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(API_ENDPOINTS.generateVideo, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          userImages: userImages.length > 0 ? userImages : undefined
        }),
        mode: 'cors',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data: VideoResponse = await response.json();

      if (data.success) {
        // Display user image feedback if available
        if (data.userImagesSummary && data.userImageDecisions) {
          const { totalProvided, accepted, rejected } = data.userImagesSummary;
          let feedbackMessage = `Video generated successfully! `;

          if (totalProvided > 0) {
            feedbackMessage += `Out of ${totalProvided} uploaded image${totalProvided !== 1 ? 's' : ''}, `;
            feedbackMessage += `${accepted} ${accepted === 1 ? 'was' : 'were'} accepted and `;
            feedbackMessage += `${rejected} ${rejected === 1 ? 'was' : 'were'} rejected by the AI.`;

            // Store decisions for display
            setUserImageDecisions(data.userImageDecisions);
          } else {
            feedbackMessage += 'You can now download it.';
          }

          setSuccessMessage(feedbackMessage);
        } else {
          setSuccessMessage('Video generated successfully! You can now download it.');
        }

        setCurrentStep('video-generation');
      } else {
        setError(data.error || 'Failed to generate video');
      }
    } catch (error) {
      setError('Failed to generate video. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyJson = async () => {
    const conversationData = {
      topic,
      conversation
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(conversationData, null, 2));
      setSuccessMessage('Conversation JSON copied to clipboard!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError('Failed to copy JSON to clipboard');
    }
  };

  const handleImportJson = () => {
    try {
      const parsedData = JSON.parse(jsonImportText);

      if (!parsedData.conversation || !Array.isArray(parsedData.conversation)) {
        throw new Error('Invalid JSON format: missing conversation array');
      }

      // Validate conversation items
      const allowedCharacters = new Set(activeCharacters);
      const normalizedConversation: ConversationItem[] = [];
      for (const item of parsedData.conversation) {
        const dialogueText =
          typeof item?.dialogue === 'string'
            ? item.dialogue
            : (typeof item?.text === 'string' ? item.text : '');
        if (!dialogueText || dialogueText.trim() === '') {
          throw new Error('Invalid conversation item: missing dialogue text');
        }

        const importedCharacter =
          typeof item?.character === 'string' && item.character.trim() !== ''
            ? item.character
            : (isSingleVoiceStyle ? singleVoiceCharacter : '');
        if (!importedCharacter) {
          throw new Error('Invalid conversation item: missing character');
        }
        if (!allowedCharacters.has(importedCharacter)) {
          throw new Error(`Invalid character "${importedCharacter}". Allowed: ${[...allowedCharacters].join(', ')}`);
        }

        normalizedConversation.push({
          character: importedCharacter,
          dialogue: dialogueText.trim(),
        });
      }

      setConversation(normalizedConversation);
      setTopic(parsedData.topic || '');
      setPrompt(''); // Clear prompt when importing
      setJsonImportText('');
      setShowJsonImport(false);
      setCurrentStep('script-review'); // Move step change here
      setSuccessMessage('Conversation imported successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(`Failed to import JSON: ${err instanceof Error ? err.message : 'Invalid JSON format'}`);
    }
  };

  const playAudio = (filename: string) => {
    const audio = new Audio(`${API_BASE_URL}/api/audio/download/${filename}`);
    audio.play().catch(() => {
      setError('Failed to play audio file');
    });
  };

  const downloadAudio = (filename: string) => {
    const link = document.createElement('a');
    link.href = `${API_BASE_URL}/api/audio/download/${filename}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRegenerateAudio = async (index: number) => {
    if (!audioFiles[index]) return;

    setRegeneratingIndex(index);
    setError('');

    try {
      const lineCharacter = conversation[index]?.character;
      const narratorPayload =
        lineCharacter === 'Narrator' && narratorReferenceAudio.trim() !== ''
          ? { narratorReferenceAudio: narratorReferenceAudio.trim() }
          : {};

      const response = await fetch(
        `${API_BASE_URL}/api/audio/regenerate/${sessionId}/${audioFiles[index].filename}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...regenerateParams, ...narratorPayload }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
      } else {
        setError('Failed to regenerate audio');
      }
    } catch (error) {
      setError('Failed to regenerate audio. Please try again.');
    } finally {
      setRegeneratingIndex(null);
      setShowRegenerateDropdown(null);
    }
  };

  const handleDeleteAudio = async (filename: string) => {
    if (!confirm('Are you sure you want to delete this audio file?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/audio/files/${filename}?sessionId=${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // Remove the deleted audio file from the state
      setAudioFiles(prev => prev.filter(file => file.filename !== filename));
    } catch (error) {
      setError('Failed to delete audio file. Please try again.');
    }
  };

  const renderInputStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <h2 className="mb-4 text-xl font-bold text-[var(--foreground)] sm:mb-6 sm:text-2xl">
        Generate New Conversation
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="videoStyle" className="mb-2 block text-sm font-medium text-[var(--foreground)]">
            Video Style
          </label>
          <select
            id="videoStyle"
            value={videoStyle}
            onChange={(e) => setVideoStyle(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-transparent focus:ring-2 focus:ring-[var(--ring)]"
            disabled={loading}
          >
            {videoStyles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--editor-muted)]">
            {videoStyles.find((style) => style.id === videoStyle)?.description || 'Choose a generation style.'}
          </p>
        </div>

        {isSingleVoiceStyle && (
          <div>
            <label htmlFor="singleVoiceCharacter" className="mb-2 block text-sm font-medium text-[var(--foreground)]">
              Single Voice Character
            </label>
            <select
              id="singleVoiceCharacter"
              value={singleVoiceCharacter}
              onChange={(e) => setSingleVoiceCharacter(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-transparent focus:ring-2 focus:ring-[var(--ring)]"
              disabled={loading}
            >
              {activeCharacters.map((character) => (
                <option key={character} value={character}>
                  {character}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--editor-muted)]">
              Character image upload for this style is a placeholder in this phase.
            </p>
          </div>
        )}
      </div>

      {isSingleVoiceStyle && singleVoiceCharacter === 'Narrator' && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-3 sm:p-4">
          <label htmlFor="narratorReferenceAudio" className="mb-2 block text-sm font-medium text-[var(--foreground)]">
            Narrator reference audio
          </label>
          <select
            id="narratorReferenceAudio"
            value={narratorReferenceAudio}
            onChange={(e) => {
              const v = e.target.value;
              setNarratorReferenceAudio(v);
              try {
                localStorage.setItem('narratorReferenceAudio', v);
              } catch {}
            }}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-transparent focus:ring-2 focus:ring-[var(--ring)]"
            disabled={loading}
          >
            <option value="">Default (backend)</option>
            {referenceAudioOptions.map((a) => (
              <option key={a.filename} value={a.filename}>
                {a.filename}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--editor-muted)]">
            Files are loaded from `backend1/storage/reference_audio`.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="prompt" className="mb-2 block text-sm font-medium text-[var(--foreground)]">
          Enter a technology topic or question:
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., Explain microservices architecture, What is machine learning?, How does Kubernetes work?"
          className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--input)] p-2 text-sm text-[var(--foreground)] focus:border-transparent focus:ring-2 focus:ring-[var(--ring)] sm:p-3 sm:text-base"
          rows={3}
          disabled={loading}
        />
      </div>

      {/* JSON Import Section */}
      <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 space-y-2 sm:space-y-0">
          <h3 className="text-base font-semibold text-[var(--foreground)] sm:text-lg">Or Import Conversation from JSON</h3>
          <button
            onClick={() => setShowJsonImport(!showJsonImport)}
            className="self-start rounded-md bg-emerald-600 px-3 py-1 text-sm text-white transition-colors hover:bg-emerald-500 sm:self-auto"
            title="Import conversation from JSON"
          >
            📤 Import JSON
          </button>
        </div>

        {showJsonImport && (
          <div className="space-y-3">
            <textarea
              value={jsonImportText}
              onChange={(e) => {
                setJsonImportText(e.target.value);
                // Clear any previous errors when user starts typing
                if (error) setError('');
              }}
              placeholder='Paste your conversation JSON. Format: {"topic":"Your Topic","conversation":[{"character":"Narrator","dialogue":"Hello"}]}'
              className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--input)] p-2 text-sm text-[var(--foreground)] focus:border-transparent focus:ring-2 focus:ring-[var(--ring)] sm:p-3 sm:text-base"
              rows={6}
            />
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
              <button
                onClick={handleImportJson}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 sm:text-base"
              >
                Import & Review Conversation
              </button>
              <button
                onClick={() => {
                  setShowJsonImport(false);
                  setJsonImportText('');
                }}
                className="rounded-md bg-neutral-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-600 sm:text-base"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleGenerateScript}
        disabled={loading || !prompt.trim()}
        className="w-full rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] transition-colors duration-200 hover:bg-[var(--secondary)] disabled:cursor-not-allowed disabled:bg-[var(--muted)] disabled:text-[var(--muted-foreground)] sm:py-3 sm:text-base"
      >
        {loading ? (
          <div className="flex items-center justify-center space-x-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
            <span className="text-sm sm:text-base">Generating Script...</span>
          </div>
        ) : (
          'Generate Script for Review'
        )}
      </button>
    </div>
  );

  const renderScriptReview = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0">
        <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">
          Review Generated Script
        </h2>
        <button
          onClick={handleRestart}
          className="self-start rounded-md bg-neutral-700 px-4 py-2 text-sm text-white transition-colors hover:bg-neutral-600 sm:self-auto sm:text-base"
        >
          Start Over
        </button>
      </div>

      {topic && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-3 sm:p-4">
          <h3 className="mb-2 text-base font-semibold text-[var(--foreground)] sm:text-lg">Topic:</h3>
          <p className="text-sm text-[var(--editor-muted)] sm:text-base">{topic}</p>
        </div>
      )}

      {/* JSON Import/Export Section */}
      <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 space-y-2 sm:space-y-0">
          <h3 className="text-base font-semibold text-[var(--foreground)] sm:text-lg">Import/Export JSON</h3>
          <div className="flex flex-col xs:flex-row space-y-1 xs:space-y-0 xs:space-x-2">
            <button
              onClick={handleCopyJson}
              className="rounded-md bg-[var(--primary)] px-3 py-1 text-xs text-[var(--primary-foreground)] transition-colors hover:bg-[var(--secondary)] sm:text-sm"
              title="Copy conversation as JSON"
            >
              Copy JSON
            </button>
            <button
              onClick={() => setShowJsonImport(!showJsonImport)}
              className="rounded-md bg-emerald-600 px-3 py-1 text-xs text-white transition-colors hover:bg-emerald-500 sm:text-sm"
              title="Import conversation from JSON"
            >
              📤 Import JSON
            </button>
          </div>
        </div>

        {showJsonImport && (
          <div className="space-y-3">
            <textarea
              value={jsonImportText}
              onChange={(e) => {
                setJsonImportText(e.target.value);
                // Clear any previous errors when user starts typing
                if (error) setError('');
              }}
              placeholder='Paste your conversation JSON. Format: {"topic":"Your Topic","conversation":[{"character":"Narrator","dialogue":"Hello"}]}'
              className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--input)] p-2 text-sm text-[var(--foreground)] focus:border-transparent focus:ring-2 focus:ring-[var(--ring)] sm:p-3 sm:text-base"
              rows={6}
            />
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
              <button
                onClick={handleImportJson}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 sm:text-base"
              >
                Import Conversation
              </button>
              <button
                onClick={() => {
                  setShowJsonImport(false);
                  setJsonImportText('');
                }}
                className="rounded-md bg-neutral-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-600 sm:text-base"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-3 sm:p-4">
        <p className="text-sm text-[var(--editor-muted)] sm:text-base">
          <strong>Review the script below:</strong> You can edit any dialogue by clicking on it.
          Once you&apos;re satisfied with the script, click &quot;Approve & Generate Audio&quot; to create the audio files.
        </p>
      </div>

      {conversation.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg sm:text-xl font-semibold text-[var(--foreground)]">Conversation Script:</h3>
          <div className="space-y-4">
            {conversation.map((item, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-l-4 bg-black/30 ${getCharacterTheme(item.character).border}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={`font-semibold text-lg ${getCharacterTheme(item.character).text}`}
                  >
                    {item.character}:
                  </span>
                  <button
                    onClick={() => handleDeleteDialogue(index)}
                    className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded-md transition-colors"
                    title="Delete dialogue"
                  >
                    🗑️ Delete
                  </button>
                </div>
                <textarea
                  value={item.dialogue}
                  onChange={(e) => handleEditScript(index, e.target.value)}
                  className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--input)] p-2 text-[var(--foreground)] focus:border-transparent focus:ring-2 focus:ring-[var(--ring)]"
                  rows={3}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-col items-center space-y-2 xs:flex-row xs:space-y-0 xs:space-x-4">
        <select
          value={selectedCharacter}
          onChange={(e) => setSelectedCharacter(e.target.value)}
          disabled={isSingleVoiceStyle}
          className="w-full xs:w-auto rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-transparent focus:ring-2 focus:ring-[var(--ring)] sm:text-base"
        >
          {activeCharacters.map((character) => (
            <option key={character} value={character}>
              {character}
            </option>
          ))}
        </select>
        <button
          onClick={handleAddDialogue}
          className="w-full xs:w-auto rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] transition-colors hover:bg-[var(--secondary)] sm:text-base"
        >
          Add Dialogue
        </button>
        {isSingleVoiceStyle && (
          <span className="text-xs text-[var(--editor-muted)]">
            Single voice mode locks speaker to {singleVoiceCharacter}.
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
        <button
          onClick={handleApproveAndGenerateAudio}
          disabled={loading}
          className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-medium py-2 sm:py-3 px-4 rounded-md transition-colors duration-200 disabled:cursor-not-allowed text-sm sm:text-base"
        >
          {loading ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span className="text-sm sm:text-base">Generating Audio...</span>
            </div>
          ) : (
            'Approve & Generate Audio'
          )}
        </button>
        <button
          onClick={handleRestart}
          disabled={loading}
          className="px-6 py-2 sm:py-3 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-md transition-colors text-sm sm:text-base"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const renderAudioGeneration = () => {
    const isGenerating = generationProgress && generationProgress.completed < generationProgress.total;
    const allComplete = generationProgress && generationProgress.completed >= generationProgress.total;
    
    return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[var(--foreground)]">
          {isGenerating ? 'Generating Audio Files...' : allComplete ? 'Audio Generated Successfully!' : 'Audio Generation'}
        </h2>
        <button
          onClick={handleRestart}
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm text-[var(--primary-foreground)] transition-colors hover:bg-[var(--secondary)]"
        >
          Generate New
        </button>
      </div>

      {/* Progress indicator */}
      {generationProgress && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-[var(--foreground)]">
              Progress: {generationProgress.completed} / {generationProgress.total} files
            </span>
            <span className="text-sm text-[var(--editor-muted)]">
              {Math.round((generationProgress.completed / generationProgress.total) * 100)}%
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-[var(--muted)]">
            <div
              className="h-3 rounded-full bg-white transition-all duration-300"
              style={{ width: `${(generationProgress.completed / generationProgress.total) * 100}%` }}
            ></div>
          </div>
        </div>
      )}


      {topic && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-4">
          <h3 className="mb-2 text-lg font-semibold text-[var(--foreground)]">Topic:</h3>
          <p className="text-[var(--editor-muted)]">{topic}</p>
        </div>
      )}

      {allComplete && (
        <div className="rounded-md border border-green-800 bg-green-900/20 p-4">
          <p className="text-green-200">
            <strong>Audio files have been generated!</strong> You can now play or download each dialogue segment.
          </p>
        </div>
      )}
      
      {isGenerating && (
        <div className="rounded-md border border-yellow-800 bg-yellow-900/20 p-4">
          <p className="text-yellow-200">
            <strong>Generating audio files...</strong> Files will appear here as they&apos;re generated. You can start reviewing completed files while others are still being processed.
          </p>
        </div>
      )}

      {conversation.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-[var(--foreground)]">Final Conversation with Audio:</h3>
          <div className="space-y-4">
            {conversation.map((item, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-l-4 ${getCharacterTheme(item.character).bubble}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <span
                    className={`font-semibold text-lg flex-shrink-0 ${getCharacterTheme(item.character).text}`}
                  >
                    {item.character}:
                  </span>
                  {(() => {
                    const fileStatus = generationProgress?.files[index]?.status;
                    const fileInfo = generationProgress?.files[index];
                    // Find the audio file by matching filename from generationProgress
                    const audioFile = fileInfo?.filename 
                      ? audioFiles.find(f => f.filename === fileInfo.filename)
                      : null;
                    
                    // Show controls if file is completed (even if audioFile not yet in state, use fileInfo.path)
                    if (fileStatus === 'completed') {
                      const fileToUse = audioFile || (fileInfo?.filename ? { filename: fileInfo.filename, path: fileInfo.path || '' } : null);
                      if (!fileToUse) {
                        return (
                          <span className="px-3 py-2 bg-green-500 text-white text-xs sm:text-sm rounded-md mt-2 sm:mt-0">
                            ✓ Ready (loading...)
                          </span>
                        );
                      }
                      return (
                        <div className="flex flex-wrap gap-1 sm:gap-2 mt-2 sm:mt-0">
                          <button
                            onClick={() => playAudio(fileToUse.filename)}
                            className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm rounded-md transition-colors flex items-center gap-1 min-w-[60px] sm:min-w-0"
                            title="Play audio"
                          >
                            <span className="text-xs">▶️</span>
                            <span className="hidden sm:inline">Play</span>
                          </button>
                          <button
                            onClick={() => downloadAudio(fileToUse.filename)}
                            className="px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white text-xs sm:text-sm rounded-md transition-colors flex items-center gap-1 min-w-[60px] sm:min-w-0"
                            title="Download audio"
                          >
                            <span className="text-xs">⬇️</span>
                            <span className="hidden sm:inline">Download</span>
                          </button>
                          <button
                            onClick={() => {
                              handleDeleteAudio(fileToUse.filename);
                            }}
                            className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-xs sm:text-sm rounded-md transition-colors flex items-center gap-1 min-w-[60px] sm:min-w-0"
                            title="Delete audio"
                          >
                            <span className="text-xs">🗑️</span>
                            <span className="hidden sm:inline">Delete</span>
                          </button>
                          <div className="relative">
                            <button
                              onClick={() => setShowRegenerateDropdown(showRegenerateDropdown === index ? null : index)}
                              className="px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-xs sm:text-sm rounded-md transition-colors flex items-center gap-1 min-w-[60px] sm:min-w-0"
                              title="Regenerate with different parameters"
                            >
                              <span className="text-xs"></span>
                              <span className="hidden sm:inline">Regenerate</span>
                            </button>
                          </div>
                        </div>
                      );
                    } else if (fileStatus === 'generating') {
                      return (
                        <span className="px-3 py-2 bg-yellow-500 text-white text-xs sm:text-sm rounded-md mt-2 sm:mt-0">
                          ⏳ Generating...
                        </span>
                      );
                    } else if (fileStatus === 'error') {
                      return (
                        <span className="px-3 py-2 bg-red-500 text-white text-xs sm:text-sm rounded-md mt-2 sm:mt-0">
                          ✗ Error
                        </span>
                      );
                    } else if (fileStatus === 'completed' && !audioFile) {
                      // File marked as completed but audioFile not yet in state (shouldn't happen, but handle gracefully)
                      return (
                        <span className="px-3 py-2 bg-green-500 text-white text-xs sm:text-sm rounded-md mt-2 sm:mt-0">
                          ✓ Ready (loading...)
                        </span>
                      );
                    } else if (generationProgress) {
                      // Show waiting status if generation has started but this file hasn't started yet
                      return (
                        <span className="px-3 py-2 bg-gray-400 text-white text-xs sm:text-sm rounded-md mt-2 sm:mt-0">
                          ⏳ Waiting...
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {item.dialogue}
                </p>

                {/* Regenerate Parameters - Show inline below dialogue */}
                {showRegenerateDropdown === index && (
                  <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md">
                    <h4 className="text-sm font-semibold mb-3 text-gray-800 dark:text-gray-200">Regenerate Parameters</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Exaggeration (0.25-2.0)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.25"
                          max="2.0"
                          value={regenerateParams.exaggeration}
                          onChange={(e) => setRegenerateParams(prev => ({ ...prev, exaggeration: parseFloat(e.target.value) }))}
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-600 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          CFG Weight (0.0-1.0)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.0"
                          max="1.0"
                          value={regenerateParams.cfgWeight}
                          onChange={(e) => setRegenerateParams(prev => ({ ...prev, cfgWeight: parseFloat(e.target.value) }))}
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-600 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Temperature (0.05-5.0)
                        </label>
                        <input
                          type="number"
                          step="0.05"
                          min="0.05"
                          max="5.0"
                          value={regenerateParams.temperature}
                          onChange={(e) => setRegenerateParams(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-600 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 pt-2">
                        <button
                          onClick={() => handleRegenerateAudio(index)}
                          disabled={regeneratingIndex === index}
                          className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm rounded disabled:opacity-50"
                        >
                          {regeneratingIndex === index ? 'Regenerating...' : 'Regenerate'}
                        </button>
                        <button
                          onClick={() => setShowRegenerateDropdown(null)}
                          className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {conversation.length === 0 && (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <p className="text-yellow-800 dark:text-yellow-200">
            No conversation data available. Please go back and generate a script first.
          </p>
        </div>
      )}

      {audioFiles.length > 0 && (
        <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
          <h4 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">
            Audio Summary
          </h4>
          <p className="text-green-700 dark:text-green-300 mb-4">
            {audioFiles.length} audio files have been generated successfully. Each dialogue segment has its own audio file.
          </p>
          <button
            onClick={() => setCurrentStep('video-generation')}
            className="w-full bg-purple-500 hover:bg-purple-600 text-white font-medium py-3 px-4 rounded-md transition-colors duration-200"
          >
            Proceed to Video Generation
          </button>
        </div>
      )}
    </div>
  );
  };

  const renderVideoGeneration = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[var(--foreground)]">
          Generate Video with Images
        </h2>
        <button
          onClick={() => setCurrentStep('audio-generation')}
          className="rounded-md bg-neutral-700 px-4 py-2 text-sm text-white transition-colors hover:bg-neutral-600"
        >
          ← Back to Audio
        </button>
      </div>

      {topic && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-4">
          <h3 className="mb-2 text-lg font-semibold text-[var(--foreground)]">Topic:</h3>
          <p className="text-[var(--editor-muted)]">{topic}</p>
        </div>
      )}

      <div className="rounded-md border border-purple-800 bg-purple-900/20 p-4">
        <p className="text-purple-100">
          <strong> Ready to create your video!</strong> Our AI will analyze your conversation and automatically generate relevant educational images.
          You can also upload your own images below for the AI to evaluate and potentially include.
        </p>
      </div>

      {/* Image Upload Section */}
      <ImageUpload
        onImagesChange={setUserImages}
        userImages={userImages}
        disabled={loading}
        sessionId={sessionId}
      />

      {/* User Image Decisions Display */}
      {userImageDecisions.length > 0 && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-4">
          <h3 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
            🤖 AI Image Evaluation Results
          </h3>
          <div className="space-y-3">
            {userImageDecisions.map((decision, index) => (
              <div
                key={index}
                className={`p-3 rounded-md border ${
                  decision.useImage
                    ? 'border-green-800 bg-green-900/20'
                    : 'border-red-800 bg-red-900/20'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-medium text-[var(--foreground)]">
                    {decision.userImageLabel}
                  </h4>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      decision.useImage
                        ? 'bg-green-900 text-green-200'
                        : 'bg-red-900 text-red-200'
                    }`}
                  >
                    {decision.useImage ? ' ACCEPTED' : ' REJECTED'}
                  </span>
                </div>
                <p className="mb-2 text-sm text-[var(--editor-muted)]">
                  <strong>AI Reasoning:</strong> {decision.reasoning}
                </p>
                {decision.useImage && decision.timestamp && (
                  <p className="text-sm text-[var(--editor-muted)]">
                    <strong>Will appear at:</strong> {decision.timestamp.toFixed(1)}s in the video
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex space-x-4">
        <button
          onClick={handleGenerateVideo}
          disabled={loading}
          className="flex-1 rounded-md bg-purple-600 py-3 px-4 font-medium text-white transition-colors duration-200 hover:bg-purple-500 disabled:cursor-not-allowed disabled:bg-[var(--muted)]"
        >
          {loading ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              <span>Generating Video...</span>
            </div>
          ) : (
            ' Generate Video'
          )}
        </button>
        <button
          onClick={handleRestart}
          disabled={loading}
          className="rounded-md bg-neutral-700 px-6 py-3 font-medium text-white transition-colors hover:bg-neutral-600"
        >
          Start Over
        </button>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-[0_20px_40px_var(--shadow)] sm:p-6">
      {/* Error Display */}
      {error && (
        <div className="mb-4 rounded-md border border-red-800 bg-red-900/20 p-3 sm:mb-6 sm:p-4">
          <p className="whitespace-pre-line text-sm text-red-300 sm:text-base">{error}</p>
        </div>
      )}

      {/* Success Display */}
      {successMessage && (
        <div className="mb-4 rounded-md border border-green-800 bg-green-900/20 p-3 sm:mb-6 sm:p-4">
          <p className="text-sm text-green-200 sm:text-base">{successMessage}</p>
        </div>
      )}

      {/* Step Progress Indicator */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center justify-between">
          <div
            className={`flex-1 text-center text-xs sm:text-sm ${
              currentStep === 'input' ? 'font-semibold text-white' : 'text-[var(--editor-muted)]'
            }`}
          >
            <span className="hidden sm:inline">1. Enter Prompt</span>
            <span className="sm:hidden">Prompt</span>
          </div>
          <div
            className={`flex-1 text-center text-xs sm:text-sm ${
              currentStep === 'script-review' ? 'font-semibold text-white' : 'text-[var(--editor-muted)]'
            }`}
          >
            <span className="hidden sm:inline">2. Review Script</span>
            <span className="sm:hidden">Review</span>
          </div>
          <div
            className={`flex-1 text-center text-xs sm:text-sm ${
              currentStep === 'audio-generation' ? 'font-semibold text-white' : 'text-[var(--editor-muted)]'
            }`}
          >
            <span className="hidden sm:inline">3. Audio Generated</span>
            <span className="sm:hidden">Audio</span>
          </div>
          <div
            className={`flex-1 text-center text-xs sm:text-sm ${
              currentStep === 'video-generation' ? 'font-semibold text-white' : 'text-[var(--editor-muted)]'
            }`}
          >
            <span className="hidden sm:inline">4. Video Generation</span>
            <span className="sm:hidden">Video</span>
          </div>
        </div>
        <div className="mt-2 h-2 rounded-full bg-[var(--muted)]">
          <div
            className="h-2 rounded-full bg-white transition-all duration-300"
            style={{
              width: currentStep === 'input' ? '25%' :
                currentStep === 'script-review' ? '50%' :
                  currentStep === 'audio-generation' ? '75%' : '100%'
            }}
          ></div>
        </div>
      </div>

      {/* Render current step */}
      {currentStep === 'input' && renderInputStep()}
      {currentStep === 'script-review' && renderScriptReview()}
      {currentStep === 'audio-generation' && renderAudioGeneration()}
      {currentStep === 'video-generation' && renderVideoGeneration()}
    </div>
  );
}
