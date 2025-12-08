'use client';

import { useState, useEffect } from 'react';
import { API_ENDPOINTS, API_BASE_URL } from '../../config/api';


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
  startOffsetSeconds?: number;
  audioFile: AudioFile | null;
}

interface SessionParameters {
  exaggeration: number;
  temperature: number;
  seedNum: number;
  cfgWeight: number;
  minP: number;
  topP: number;
  repetitionPenalty: number;
}

interface SessionStats {
  totalDialogues: number;
  audioFilesGenerated: number;
  allSuccessful: boolean;
}

interface AudioSession {
  sessionId: string;
  name?: string;
  createdAt: string;
  parameters: SessionParameters;
  stats: SessionStats;
  dialogues: Dialogue[];
  files: AudioFile[];
}

interface AudioResponse {
  success: boolean;
  sessions: AudioSession[];
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

export default function AudioBrowser() {
  const [sessions, setSessions] = useState<AudioSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [regeneratingIndex, setRegeneratingIndex] = useState<string | null>(null);
  const [showRegenerateDropdown, setShowRegenerateDropdown] = useState<string | null>(null);
  const [regenerateParams, setRegenerateParams] = useState({
    text: '',
    exaggeration: 0.6,
    temperature: 1.5,
    seedNum: 0,
    cfgWeight: 0.4,
    minP: 0.05,
    topP: 1.0,
    repetitionPenalty: 1.2
  });
  const [sessionDurations, setSessionDurations] = useState<Record<string, number>>({});
  const [sessionOffsets, setSessionOffsets] = useState<Record<string, Record<string, number>>>({});
  const [playingSession, setPlayingSession] = useState<string | null>(null);
  const [currentAudioElement, setCurrentAudioElement] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchAudioFiles();
  }, []);

  // When sessions change, compute total duration per session using backend-provided totals if available,
  // falling back to per-file durations or client-side metadata if missing
  useEffect(() => {
    let cancelled = false;

    if (sessions.length === 0) {
      setSessionDurations({});
      return () => { cancelled = true; };
    }

  // If backend already provided totals on each session, use those first
    const backendTotals: Record<string, number> = {};
    let hasAnyBackendTotal = false;
    sessions.forEach((s: any) => {
      if (typeof s.totalDurationSeconds === 'number' && s.totalDurationSeconds > 0) {
        backendTotals[s.sessionId] = Math.floor(s.totalDurationSeconds);
        hasAnyBackendTotal = true;
      }
    });
    if (hasAnyBackendTotal) {
      setSessionDurations(backendTotals);
    // Also use backend-provided start offsets per dialogue if present
    const offsets: Record<string, Record<string, number>> = {};
    sessions.forEach((s: any) => {
      const map: Record<string, number> = {};
      s.dialogues?.forEach((d: any) => {
        if (typeof d.startOffsetSeconds === 'number') {
          map[d.id] = Math.max(0, Math.floor(d.startOffsetSeconds));
        }
      });
      offsets[s.sessionId] = map;
    });
    setSessionOffsets(offsets);
      return () => { cancelled = true; };
    }

    const getAudioDuration = (url: string): Promise<number> => {
      return new Promise((resolve) => {
        const audio = new Audio();
        const cleanup = () => {
          audio.removeEventListener('loadedmetadata', onLoaded);
          audio.removeEventListener('error', onError);
        };
        const onLoaded = () => {
          const duration = isFinite(audio.duration) ? audio.duration : 0;
          cleanup();
          resolve(Math.max(0, duration));
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

    const compute = async () => {
      const perSessionTotals: Record<string, number> = {};
      const perSessionOffsets: Record<string, Record<string, number>> = {};

      for (const session of sessions) {
        // Build ordered list of dialogues with audio
        const dialoguesWithAudio = session.dialogues.filter(d => !!d.audioFile);

        // Determine per-dialogue durations (using backend first)
        const durations: number[] = new Array(dialoguesWithAudio.length).fill(0);
        const pending: { index: number; promise: Promise<number> }[] = [];

        dialoguesWithAudio.forEach((d, idx) => {
          const backendDuration = typeof d.audioFile!.duration === 'number' ? d.audioFile!.duration : 0;
          if (backendDuration && isFinite(backendDuration)) {
            durations[idx] = Math.max(0, backendDuration);
          } else {
            const url = `${API_BASE_URL}/api/audio/download/${d.audioFile!.filename}?sessionId=${session.sessionId}`;
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

        // Compute offsets per dialogue id
        let cumulative = 0;
        const offsetsForSession: Record<string, number> = {};
        dialoguesWithAudio.forEach((d, idx) => {
          offsetsForSession[d.id] = Math.floor(cumulative);
          cumulative += durations[idx];
        });

        perSessionOffsets[session.sessionId] = offsetsForSession;
        perSessionTotals[session.sessionId] = Math.floor(cumulative);
      }

      if (!cancelled) {
        setSessionOffsets(perSessionOffsets);
        setSessionDurations(perSessionTotals);
      }
    };

    compute();

    return () => { cancelled = true; };
  }, [sessions]);

  // Normalize different backend shapes:
  // 1) Node backend: { success: boolean, sessions: [...] }
  // 2) Python (WhisperX) flat list: [ { filename, sessionId, ... } ]
  // 3) Python (WhisperX) grouped: { sessions, files }
  const normalizeSessions = (rawData: any): AudioSession[] => {
    // Case 1: Node backend with success flag
    if (rawData && typeof rawData === 'object' && 'success' in rawData) {
      const typed = rawData as AudioResponse;
      if (!typed.success) {
        throw new Error('Server returned success=false');
      }
      return typed.sessions || [];
    }

    // Case 2: Python grouped payload { sessions, files }
    if (rawData && typeof rawData === 'object' && 'sessions' in rawData) {
      return Array.isArray((rawData as any).sessions) ? (rawData as any).sessions : [];
    }

    // Case 3: Python flat array -> group by sessionId
    if (Array.isArray(rawData)) {
      const bySession: Record<string, AudioSession> = {};

      rawData.forEach((item: any, idx: number) => {
        const sessionId = item.sessionId || 'unknown_session';
        if (!bySession[sessionId]) {
          bySession[sessionId] = {
            sessionId,
            name: item.topic || `Session ${sessionId}`,
            createdAt: item.generatedAt
              ? new Date(
                  // generatedAt from stat.mtime is seconds; heuristic to convert
                  item.generatedAt > 10_000_000_000 ? item.generatedAt : item.generatedAt * 1000
                ).toISOString()
              : new Date().toISOString(),
            parameters: {
              exaggeration: item.exaggeration ?? 0.6,
              temperature: item.temperature ?? 1.5,
              seedNum: item.seedNum ?? 0,
              cfgWeight: item.cfgWeight ?? 0.4,
              minP: item.minP ?? 0.05,
              topP: item.topP ?? 1.0,
              repetitionPenalty: item.repetitionPenalty ?? 1.2
            },
            stats: {
              totalDialogues: 0,
              audioFilesGenerated: 0,
              allSuccessful: true
            },
            dialogues: [],
            files: []
          };
        }

        const session = bySession[sessionId];
        const file: AudioFile = {
          id: item.id || item.filename || `file_${idx}`,
          filename: item.filename || `file_${idx}.wav`,
          path: item.path || '',
          fileSize: item.fileSize || 0,
          generatedAt: item.generatedAt
            ? new Date(
                item.generatedAt > 10_000_000_000 ? item.generatedAt : item.generatedAt * 1000
              ).toISOString()
            : new Date().toISOString(),
          duration: item.duration || 0
        };

        const dialogue: Dialogue = {
          id: item.dialogueId || `${sessionId}_${session.dialogues.length}`,
          text: item.text || '',
          character: item.character || 'Unknown',
          order: typeof item.order === 'number' ? item.order : session.dialogues.length,
          audioFile: file,
          startOffsetSeconds: item.startOffsetSeconds
        };

        session.dialogues.push(dialogue);
        session.files.push(file);
        session.stats.totalDialogues += 1;
        session.stats.audioFilesGenerated += 1;
      });

      return Object.values(bySession).sort((a, b) => {
        const ai = parseInt(a.sessionId.replace(/\D/g, ''), 10);
        const bi = parseInt(b.sessionId.replace(/\D/g, ''), 10);
        if (isNaN(ai) || isNaN(bi)) return 0;
        return bi - ai;
      });
    }

    // Unknown shape
    throw new Error('Unexpected response format from /api/audio/files');
  };

  const fetchAudioFiles = async () => {
    console.log(' Fetching audio files...');
    setLoading(true);
    setError('');

    try {
      console.log('🌐 Fetching from:', API_ENDPOINTS.audio);

      // Ask Python backend for grouped sessions to ease normalization; Node ignores the param.
      const response = await fetch(`${API_ENDPOINTS.audio}?flat=false`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors', // Explicitly set CORS mode
        credentials: 'include', // Include credentials if needed
      });

      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error(' Response error text:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const rawData = await response.json();
      console.log(' Fetched audio files data:', rawData);

      const normalized = normalizeSessions(rawData);

      // Sort sessions newest-first by createdAt (fallback to updatedAt, then numeric suffix)
      const sortedSessions = normalized.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
        if (dateA !== dateB) return dateB - dateA;

        // Fallback to numeric suffix if dates are missing/identical
        const aId = parseInt(String(a.sessionId).replace(/\D/g, '')) || 0;
        const bId = parseInt(String(b.sessionId).replace(/\D/g, '')) || 0;
        return bId - aId;
      });

      console.log(' Sorted sessions:', sortedSessions.length);
      setSessions(sortedSessions);
      console.log(' Sessions state updated');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorType = error instanceof Error ? error.constructor.name : 'Unknown';
      console.error('💥 Error fetching audio files:', error);
      console.error('💥 Error type:', errorType);
      console.error('💥 Error message:', errorMessage);
      console.error('💥 Full error object:', error);

      // More specific error messages for common issues
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('CORS')) {
        setError('Connection blocked by browser security. Try: 1) Disable ad blockers, 2) Check antivirus settings, 3) Open http://localhost:5376 directly in a new tab.');
      } else if (errorMessage.includes('ERR_NETWORK_CHANGED')) {
        setError('Network connection changed. Please refresh the page.');
      } else if (errorMessage.includes('net::ERR_INTERNET_DISCONNECTED')) {
        setError('No internet connection. Please check your network.');
      } else {
        setError(`Failed to connect to server: ${errorMessage}. Make sure the backend is running on ${API_BASE_URL}.`);
      }
    } finally {
      console.log(' fetchAudioFiles completed');
      setLoading(false);
    }
  };

  const toggleSession = (sessionId: string) => {
    const newExpandedSessions = new Set(expandedSessions);
    if (newExpandedSessions.has(sessionId)) {
      newExpandedSessions.delete(sessionId);
    } else {
      newExpandedSessions.add(sessionId);
    }
    setExpandedSessions(newExpandedSessions);
  };

  const playAudio = (filename: string, sessionId: string) => {
    const audio = new Audio(`${API_BASE_URL}/api/audio/download/${filename}?sessionId=${sessionId}`);
    audio.play().catch(err => {
      console.error('Error playing audio:', err);
      setError('Failed to play audio file');
    });
  };

  const playAllAudio = async (sessionId: string) => {
    const session = sessions.find(s => s.sessionId === sessionId);
    if (!session) return;

    // Stop any currently playing audio
    if (currentAudioElement) {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
    }

    // Get all dialogues with audio files, sorted by order
    const dialoguesWithAudio = session.dialogues
      .filter(d => d.audioFile)
      .sort((a, b) => a.order - b.order);

    if (dialoguesWithAudio.length === 0) {
      setError('No audio files to play in this session');
      return;
    }

    setPlayingSession(sessionId);

    // Play each audio file sequentially
    for (let i = 0; i < dialoguesWithAudio.length; i++) {
      const dialogue = dialoguesWithAudio[i];

      try {
        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(`${API_BASE_URL}/api/audio/download/${dialogue.audioFile!.filename}?sessionId=${sessionId}`);
          setCurrentAudioElement(audio);

          audio.addEventListener('ended', () => {
            resolve();
          });

          audio.addEventListener('error', (err) => {
            console.error('Error playing audio:', err);
            reject(err);
          });

          audio.play().catch(err => {
            console.error('Error playing audio:', err);
            reject(err);
          });
        });
      } catch (error) {
        console.error('Failed to play audio file:', error);
        setError('Failed to play audio file');
        break;
      }
    }

    setPlayingSession(null);
    setCurrentAudioElement(null);
  };

  const stopAllAudio = () => {
    if (currentAudioElement) {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
      setCurrentAudioElement(null);
    }
    setPlayingSession(null);
  };

  const downloadAudio = (filename: string, sessionId: string) => {
    const link = document.createElement('a');
    link.href = `${API_BASE_URL}/api/audio/download/${filename}?sessionId=${sessionId}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deleteAudioFile = async (filename: string, sessionId: string) => {
    if (!confirm('Are you sure you want to delete this audio file?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/audio/files/${filename}?sessionId=${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // Refresh the audio files list
      await fetchAudioFiles();
      
      console.log('Audio file deleted successfully');
    } catch (error) {
      console.error('Error deleting audio file:', error);
      setError('Failed to delete audio file. Please try again.');
    }
  };

  const regenerateAudioFile = async (filename: string, sessionId: string, currentText: string) => {
    setRegeneratingIndex(filename);
    setError('');

    // Prepare the request body with current text if not modified
    const requestBody = {
      ...regenerateParams,
      text: regenerateParams.text.trim() !== '' ? regenerateParams.text.trim() : currentText
    };

    console.log(' Regenerating audio with request body:', requestBody);
    console.log('🔗 API URL:', `${API_BASE_URL}/api/audio/regenerate/${sessionId}/${filename}`);

    // Check if the request body looks correct
    console.log(' Request body JSON:', JSON.stringify(requestBody, null, 2));

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/audio/regenerate/${sessionId}/${filename}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error(' Response error text:', errorText);
        const errorData = JSON.parse(errorText);
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Response data:', data);

      if (data.success) {
        // Refresh the audio files list to show updated file
        console.log('✅ Regeneration successful, refreshing audio files...');
        await fetchAudioFiles();
        console.log('✅ Audio files refreshed successfully');
        setError(''); // Clear any previous errors
      } else {
        console.error(' Regeneration failed:', data);
        setError('Failed to regenerate audio');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorType = error instanceof Error ? error.constructor.name : 'Unknown';
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('💥 Error regenerating audio:', error);
      console.error('💥 Error type:', errorType);
      console.error('💥 Error message:', errorMessage);
      console.error('💥 Error stack:', errorStack);
      setError(`Failed to regenerate audio: ${errorMessage}`);
    } finally {
      setRegeneratingIndex(null);
      setShowRegenerateDropdown(null);
    }
  };

  const deleteSession = async (sessionId: string) => {
    const session = sessions.find(s => s.sessionId === sessionId);
    const sessionName = session?.name || `Session ${sessionId}`;
    
    if (!confirm(`Are you sure you want to delete "${sessionName}" and all its audio files? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_ENDPOINTS.deleteSession}/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // Remove the session from the state
        setSessions(sessions.filter(session => session.sessionId !== sessionId));
        alert(`"${sessionName}" deleted successfully`);
      } else {
        throw new Error(data.error || 'Failed to delete session');
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      setError('Failed to delete session. Please try again.');
    }
  };

  const formatSessionId = (sessionId: string) => {
    try {
      const timestamp = parseInt(sessionId.replace('audio_', ''));
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return sessionId;
    }
  };

  if (loading) {
    return (
      <div className="bg-[#2F3438] rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
          <span className="ml-3 text-[#787774]">Loading audio files...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#2F3438] rounded-lg shadow-lg p-3 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-[#F1F1EF]">
          Browse Audio Files
        </h2>
        <button
          onClick={fetchAudioFiles}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors self-start sm:self-auto"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">🎵</div>
          <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-300 mb-2">
            No audio files found
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Generate some conversations with audio to see them here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Found {sessions.length} conversation session{sessions.length !== 1 ? 's' : ''}
          </p>
          
          {sessions.map((session) => (
            <div
              key={session.sessionId}
              className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            >
              {/* Session Header */}
              <div className="bg-gray-50 dark:bg-gray-700 px-3 sm:px-4 py-3 flex items-center justify-between">
                <button
                  onClick={() => toggleSession(session.sessionId)}
                  className="flex items-start sm:items-center space-x-2 sm:space-x-3 flex-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded px-2 py-1 -mx-2 -my-1 transition-colors"
                >
                  <span className="text-lg flex-shrink-0 mt-0.5 sm:mt-0">
                    {expandedSessions.has(session.sessionId) ? '📂' : '📁'}
                  </span>
                  <div className="text-left min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-800 dark:text-white text-sm sm:text-base break-words">
                      {session.name || `Session ${session.sessionId}`}
                    </h3>
                    <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 space-y-1 sm:space-y-0">
                      <div className="flex flex-wrap gap-1 sm:gap-2">
                        <span>{formatSessionId(session.sessionId)}</span>
                        <span>•</span>
                        <span>{session.stats.audioFilesGenerated}/{session.stats.totalDialogues} files</span>
                        <span>•</span>
                        <span>{session.stats.allSuccessful ? '✅ Complete' : '⚠️ Partial'}</span>
                      </div>
                      <div className="sm:inline">
                        <span>Total: {formatDurationLabel(sessionDurations[session.sessionId] || 0)}</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 flex flex-wrap gap-2">
                      <span>Exag: {session.parameters.exaggeration}</span>
                      <span>•</span>
                      <span>Temp: {session.parameters.temperature}</span>
                    </div>
                  </div>
                  <span className="text-gray-400 ml-2 flex-shrink-0">
                    {expandedSessions.has(session.sessionId) ? '▼' : '▶'}
                  </span>
                </button>
                <div className="flex items-center gap-2 ml-2 sm:ml-3">
                  {playingSession === session.sessionId ? (
                    <button
                      onClick={() => stopAllAudio()}
                      className="px-2 sm:px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs sm:text-sm rounded-md transition-colors flex-shrink-0 flex items-center gap-1"
                      title="Stop playing all audio"
                    >
                      <span>⏹️</span>
                      <span className="hidden sm:inline">Stop</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => playAllAudio(session.sessionId)}
                      className="px-2 sm:px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs sm:text-sm rounded-md transition-colors flex-shrink-0 flex items-center gap-1"
                      title="Play all audio files in sequence"
                      disabled={session.stats.audioFilesGenerated === 0}
                    >
                      <span>▶️</span>
                      <span className="hidden sm:inline">Play All</span>
                    </button>
                  )}
                  <button
                    onClick={() => deleteSession(session.sessionId)}
                    className="px-2 sm:px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs sm:text-sm rounded-md transition-colors flex-shrink-0"
                    title="Delete session and all audio files"
                  >
                    <span className="sm:hidden">🗑️</span>
                    <span className="hidden sm:inline">🗑️ Delete</span>
                  </button>
                </div>
              </div>

              {/* Session Content */}
              {expandedSessions.has(session.sessionId) && (
                <div className="p-3 sm:p-4 space-y-3">
                  {session.dialogues.map((dialogue) => (
                    <div
                      key={dialogue.id}
                      className={`dialogue-container p-3 sm:p-4 rounded-lg border-l-4 overflow-visible ${
                        dialogue.character === 'Stewie'
                          ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-400'
                          : dialogue.character === 'Peter'
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-400'
                          : 'bg-gray-50 dark:bg-gray-700 border-gray-400'
                      }`}
                    >
                      <div className="space-y-3 min-w-0">
                        <div className="flex items-start space-x-2 sm:space-x-3 mb-2">
                          <span className="text-xl sm:text-2xl flex-shrink-0">
                            {dialogue.character === 'Stewie' ? '👶' : dialogue.character === 'Peter' ? '👨' : '🎵'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`font-semibold text-sm sm:text-base ${
                              dialogue.character === 'Stewie'
                                ? 'text-purple-700 dark:text-purple-300'
                                : dialogue.character === 'Peter'
                                ? 'text-green-700 dark:text-green-300'
                                : 'text-gray-700 dark:text-gray-300'
                            }`}>
                              {dialogue.character} - Line {dialogue.order}
                            </p>
                            {dialogue.audioFile && (
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {dialogue.audioFile.filename} • {(dialogue.audioFile.fileSize / 1024).toFixed(1)} KB •
                                <span className="ml-1">
                                  ⏱️ {formatDurationLabel((sessionOffsets[session.sessionId]?.[dialogue.id]) || 0)}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="ml-0 sm:ml-11 mt-2 overflow-hidden">
                          <p className="text-gray-800 dark:text-gray-200 italic text-sm sm:text-base break-words word-wrap overflow-wrap-anywhere">
                            &ldquo;{dialogue.text}&rdquo;
                          </p>
                        </div>
                        
                        {dialogue.audioFile && (
                          <div className="flex flex-wrap gap-2 ml-0 sm:ml-11 mt-3">
                            <button
                              onClick={() => playAudio(dialogue.audioFile!.filename, session.sessionId)}
                              className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm rounded-md transition-colors flex items-center gap-1"
                              title="Play audio"
                            >
                            <span>▶️</span>
                            <span className="hidden sm:inline">Play</span>
                          </button>
                          <button
                            onClick={() => downloadAudio(dialogue.audioFile!.filename, session.sessionId)}
                            className="px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white text-xs sm:text-sm rounded-md transition-colors flex items-center gap-1"
                            title="Download audio"
                          >
                            <span>⬇️</span>
                            <span className="hidden sm:inline">Download</span>
                          </button>
                          <button
                            onClick={() => deleteAudioFile(dialogue.audioFile!.filename, session.sessionId)}
                            className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-xs sm:text-sm rounded-md transition-colors flex items-center gap-1"
                            title="Delete audio file"
                          >
                            <span>🗑️</span>
                            <span className="hidden sm:inline">Delete</span>
                          </button>
                          <div className="relative">
                            <button
                              onClick={() => {
                                setShowRegenerateDropdown(
                                  showRegenerateDropdown === dialogue.audioFile!.filename
                                    ? null
                                    : dialogue.audioFile!.filename
                                );
                                // Reset parameters with current text
                                console.log(' Opening regenerate dropdown for:', dialogue.audioFile!.filename);
                                console.log(' Current dialogue text:', dialogue.text);
                                setRegenerateParams(prev => ({
                                  ...prev,
                                  text: dialogue.text
                                }));
                                console.log(' Set regenerateParams.text to:', dialogue.text);
                              }}
                              className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm rounded-md transition-colors flex items-center gap-1"
                              title="Regenerate audio with different parameters"
                              disabled={regeneratingIndex === dialogue.audioFile!.filename}
                            >
                              <span></span>
                              <span className="hidden sm:inline">
                                {regeneratingIndex === dialogue.audioFile!.filename ? 'Regenerating...' : 'Regenerate'}
                              </span>
                            </button>
                          </div>
                        </div>
                        )}

                        {/* Regenerate Parameters - Show inline on mobile, dropdown on desktop */}
                        {showRegenerateDropdown === dialogue.audioFile!.filename && (
                          <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md">
                            <h4 className="text-sm font-semibold mb-3 text-gray-800 dark:text-gray-200">Regenerate Parameters</h4>
                            
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Exaggeration: {regenerateParams.exaggeration}
                                </label>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.1"
                                  value={regenerateParams.exaggeration}
                                  onChange={(e) => setRegenerateParams(prev => ({ ...prev, exaggeration: parseFloat(e.target.value) }))}
                                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                />
                              </div>
                              
                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Temperature: {regenerateParams.temperature}
                                </label>
                                <input
                                  type="range"
                                  min="0.5"
                                  max="2.0"
                                  step="0.1"
                                  value={regenerateParams.temperature}
                                  onChange={(e) => setRegenerateParams(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                />
                              </div>
                              
                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Seed: {regenerateParams.seedNum}
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  max="999999"
                                  value={regenerateParams.seedNum}
                                  onChange={(e) => setRegenerateParams(prev => ({ ...prev, seedNum: parseInt(e.target.value) || 0 }))}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                />
                              </div>
                              
                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  CFG Weight: {regenerateParams.cfgWeight}
                                </label>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.1"
                                  value={regenerateParams.cfgWeight}
                                  onChange={(e) => setRegenerateParams(prev => ({ ...prev, cfgWeight: parseFloat(e.target.value) }))}
                                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                />
                              </div>
                              
                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Min P: {regenerateParams.minP}
                                </label>
                                <input
                                  type="range"
                                  min="0"
                                  max="0.5"
                                  step="0.01"
                                  value={regenerateParams.minP}
                                  onChange={(e) => setRegenerateParams(prev => ({ ...prev, minP: parseFloat(e.target.value) }))}
                                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                />
                              </div>
                              
                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Top P: {regenerateParams.topP}
                                </label>
                                <input
                                  type="range"
                                  min="0.5"
                                  max="1.0"
                                  step="0.05"
                                  value={regenerateParams.topP}
                                  onChange={(e) => setRegenerateParams(prev => ({ ...prev, topP: parseFloat(e.target.value) }))}
                                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                />
                              </div>
                              
                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Repetition Penalty: {regenerateParams.repetitionPenalty}
                                </label>
                                <input
                                  type="range"
                                  min="1.0"
                                  max="2.0"
                                  step="0.1"
                                  value={regenerateParams.repetitionPenalty}
                                  onChange={(e) => setRegenerateParams(prev => ({ ...prev, repetitionPenalty: parseFloat(e.target.value) }))}
                                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                />
                              </div>
                            </div>
                            
                            <div className="space-y-3 mt-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Dialogue Text (leave empty to use original text)
                                </label>
                                <textarea
                                  value={regenerateParams.text}
                                  onChange={(e) => setRegenerateParams(prev => ({ ...prev, text: e.target.value }))}
                                  rows={4}
                                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
                                  placeholder={dialogue.text}
                                />
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-4">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log('🔘 Button clicked for file:', dialogue.audioFile!.filename);
                                  console.log('🔘 Current regenerateParams:', regenerateParams);
                                  console.log('🔘 Current text value:', regenerateParams.text);
                                  regenerateAudioFile(dialogue.audioFile!.filename, session.sessionId, dialogue.text);
                                }}
                                className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-md transition-colors disabled:opacity-50"
                                disabled={regeneratingIndex === dialogue.audioFile!.filename}
                              >
                                {regeneratingIndex === dialogue.audioFile!.filename ? 'Regenerating...' : 'Regenerate Audio'}
                              </button>
                              <button
                                onClick={() => setShowRegenerateDropdown(null)}
                                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded-md transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
