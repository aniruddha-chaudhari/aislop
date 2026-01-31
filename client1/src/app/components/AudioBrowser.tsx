'use client';

import { useState, useEffect } from 'react';
import { Music, FolderOpen, Folder, CheckCircle, AlertTriangle, Square, Play, Trash2, Download, RefreshCw, Baby, User } from 'lucide-react';
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
  updatedAt?: string;
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

    const backendTotals: Record<string, number> = {};
    let hasAnyBackendTotal = false;
    sessions.forEach((s: AudioSession & { totalDurationSeconds?: number }) => {
      if (typeof s.totalDurationSeconds === 'number' && s.totalDurationSeconds > 0) {
        backendTotals[s.sessionId] = Math.floor(s.totalDurationSeconds);
        hasAnyBackendTotal = true;
      }
    });
    if (hasAnyBackendTotal) {
      setSessionDurations(backendTotals);
      const offsets: Record<string, Record<string, number>> = {};
      sessions.forEach((s: AudioSession) => {
        const map: Record<string, number> = {};
        s.dialogues?.forEach((d: Dialogue) => {
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
        const dialoguesWithAudio = session.dialogues.filter(d => !!d.audioFile);
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

  // Normalize different backend shapes
  const normalizeSessions = (rawData: any): AudioSession[] => {
    if (rawData && typeof rawData === 'object' && 'success' in rawData) {
      const typed = rawData as AudioResponse;
      if (!typed.success) {
        throw new Error('Server returned success=false');
      }
      return typed.sessions || [];
    }

    if (rawData && typeof rawData === 'object' && 'sessions' in rawData) {
      return Array.isArray((rawData as any).sessions) ? (rawData as any).sessions : [];
    }

    throw new Error('Unexpected response format from /api/audio/files');
  };

  const fetchAudioFiles = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_ENDPOINTS.audio}?flat=false`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const rawData = await response.json();
      const normalized = normalizeSessions(rawData);

      // Sort sessions newest-first
      const sortedSessions = normalized.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      setSessions(sortedSessions);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to connect to server: ${errorMessage}`);
    } finally {
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

    if (currentAudioElement) {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
    }

    const dialoguesWithAudio = session.dialogues
      .filter(d => d.audioFile)
      .sort((a, b) => a.order - b.order);

    if (dialoguesWithAudio.length === 0) {
      setError('No audio files to play in this session');
      return;
    }

    setPlayingSession(sessionId);

    for (let i = 0; i < dialoguesWithAudio.length; i++) {
      const dialogue = dialoguesWithAudio[i];

      try {
        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(`${API_BASE_URL}/api/audio/download/${dialogue.audioFile!.filename}?sessionId=${sessionId}`);
          setCurrentAudioElement(audio);

          audio.addEventListener('ended', () => resolve());
          audio.addEventListener('error', (err) => reject(err));
          audio.play().catch(err => reject(err));
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
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await fetchAudioFiles();
    } catch (error) {
      console.error('Error deleting audio file:', error);
      setError('Failed to delete audio file');
    }
  };

  const regenerateAudioFile = async (filename: string, sessionId: string, currentText: string) => {
    setRegeneratingIndex(filename);
    setError('');

    const requestBody = {
      ...regenerateParams,
      text: regenerateParams.text.trim() !== '' ? regenerateParams.text.trim() : currentText
    };

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/audio/regenerate/${sessionId}/${filename}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        await fetchAudioFiles();
        setError('');
      } else {
        setError('Failed to regenerate audio');
      }
    } catch (error) {
      console.error('Error regenerating audio:', error);
      setError('Failed to regenerate audio');
    } finally {
      setRegeneratingIndex(null);
      setShowRegenerateDropdown(null);
    }
  };

  const deleteSession = async (sessionId: string) => {
    const session = sessions.find(s => s.sessionId === sessionId);
    const sessionName = session?.name || `Session ${sessionId}`;

    if (!confirm(`Are you sure you want to delete "${sessionName}"?`)) {
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.deleteAudioSession(sessionId), {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setSessions(sessions.filter(s => s.sessionId !== sessionId));
    } catch (error) {
      console.error('Error deleting session:', error);
      setError('Failed to delete session');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-[var(--editor-muted)]">Loading audio files...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <div className="text-sm font-semibold">Audio Library</div>
          <div className="mt-1 text-xs text-[var(--editor-muted)]">
            {sessions.length > 0 ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''}` : 'No sessions yet'}
          </div>
        </div>
        <button
          onClick={fetchAudioFiles}
          className="studio-button-secondary rounded-xl px-3 py-2 text-xs font-semibold shadow-[0_14px_32px_var(--shadow)] transition"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center">
          <Music className="w-16 h-16 mx-auto mb-4 text-[var(--editor-muted)]" />
          <h3 className="text-lg font-semibold mb-2">No audio files found</h3>
          <p className="text-sm text-[var(--editor-muted)]">
            Generate conversations with audio to see them here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.sessionId}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_18px_40px_var(--shadow)] overflow-hidden transition hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] hover:bg-[color-mix(in_srgb,var(--card)_85%,black)]"
            >
              <div className="px-4 py-3 flex items-center justify-between bg-[var(--muted)]/30 border-b border-[var(--border)]">
                <button
                  onClick={() => toggleSession(session.sessionId)}
                  className="flex items-center space-x-3 flex-1 text-left hover:opacity-80 transition"
                >
                  {expandedSessions.has(session.sessionId) ? (
                    <FolderOpen className="w-5 h-5 flex-shrink-0 text-[var(--editor-muted)]" />
                  ) : (
                    <Folder className="w-5 h-5 flex-shrink-0 text-[var(--editor-muted)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold truncate">
                      {session.name || `Session ${session.sessionId}`}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--editor-muted)] mt-1">
                      <span>{session.stats.audioFilesGenerated}/{session.stats.totalDialogues} files</span>
                      <span>•</span>
                      <span>Total: {formatDurationLabel(sessionDurations[session.sessionId] ?? 0)}</span>
                      <span>•</span>
                      {session.stats.allSuccessful ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Complete
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Partial
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  {playingSession === session.sessionId ? (
                    <button
                      onClick={() => stopAllAudio()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => playAllAudio(session.sessionId)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-medium transition"
                      disabled={session.stats.audioFilesGenerated === 0}
                    >
                      <Play className="w-3.5 h-3.5" />
                      Play All
                    </button>
                  )}
                  <button
                    onClick={() => deleteSession(session.sessionId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-medium border border-red-500/20 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              {expandedSessions.has(session.sessionId) && (
                <div className="p-4 space-y-3">
                  {session.dialogues.map((dialogue) => (
                    <div
                      key={dialogue.id}
                      className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 p-4 transition hover:bg-[var(--muted)]/30"
                    >
                      <div className="flex items-start gap-3 mb-3">
                        {dialogue.character === 'Stewie' ? (
                          <Baby className="w-6 h-6 flex-shrink-0 mt-0.5 text-[var(--editor-muted)]" />
                        ) : (
                          <User className="w-6 h-6 flex-shrink-0 mt-0.5 text-[var(--editor-muted)]" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-sm font-semibold">
                              {dialogue.character}
                            </p>
                            <span className="text-xs text-[var(--editor-muted)]">•</span>
                            <p className="text-xs text-[var(--editor-muted)]">
                              Line {dialogue.order}
                            </p>
                          </div>
                          {dialogue.audioFile && (
                            <p className="text-xs text-[var(--editor-muted)] font-mono break-all">
                              {dialogue.audioFile.filename}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="ml-11 border-l-2 border-[var(--accent)]/30 pl-3">
                        <p className="text-base leading-relaxed text-white">
                          {dialogue.text}
                        </p>
                      </div>

                      {dialogue.audioFile && (
                        <>
                          <div className="flex flex-wrap gap-2 ml-11 mt-4">
                            <button
                              onClick={() => playAudio(dialogue.audioFile!.filename, session.sessionId)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition"
                            >
                              <Play className="w-3.5 h-3.5" />
                              Play
                            </button>
                            <button
                              onClick={() => downloadAudio(dialogue.audioFile!.filename, session.sessionId)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-500 hover:bg-gray-600 text-white text-xs font-medium transition"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </button>
                            <button
                              onClick={() => deleteAudioFile(dialogue.audioFile!.filename, session.sessionId)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                            <button
                              onClick={() => {
                                setShowRegenerateDropdown(
                                  showRegenerateDropdown === dialogue.audioFile!.filename
                                    ? null
                                    : dialogue.audioFile!.filename
                                );
                                setRegenerateParams(prev => ({
                                  ...prev,
                                  text: dialogue.text
                                }));
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium transition"
                              disabled={regeneratingIndex === dialogue.audioFile!.filename}
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${regeneratingIndex === dialogue.audioFile!.filename ? 'animate-spin' : ''}`} />
                              {regeneratingIndex === dialogue.audioFile!.filename ? 'Regenerating...' : 'Regenerate'}
                            </button>
                          </div>

                          {/* Regenerate Parameters */}
                          {showRegenerateDropdown === dialogue.audioFile!.filename && (
                            <div className="mt-4 p-4 bg-[var(--muted)]/50 border border-[var(--border)] rounded-lg ml-11">
                              <h4 className="text-sm font-semibold mb-3">Regenerate Parameters</h4>

                              <div className="space-y-3">
                                <div>
                                  <label className="block text-xs font-medium mb-1">
                                    Exaggeration: {regenerateParams.exaggeration}
                                  </label>
                                  <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={regenerateParams.exaggeration}
                                    onChange={(e) => setRegenerateParams(prev => ({ ...prev, exaggeration: parseFloat(e.target.value) }))}
                                    className="w-full"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-medium mb-1">
                                    Temperature: {regenerateParams.temperature}
                                  </label>
                                  <input
                                    type="range"
                                    min="0.5"
                                    max="2.0"
                                    step="0.1"
                                    value={regenerateParams.temperature}
                                    onChange={(e) => setRegenerateParams(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                                    className="w-full"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-medium mb-1">
                                    Seed: {regenerateParams.seedNum}
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="999999"
                                    value={regenerateParams.seedNum}
                                    onChange={(e) => setRegenerateParams(prev => ({ ...prev, seedNum: parseInt(e.target.value) || 0 }))}
                                    className="w-full px-2 py-1 text-sm border border-[var(--border)] rounded-md bg-[var(--background)]"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-medium mb-1">
                                    CFG Weight: {regenerateParams.cfgWeight}
                                  </label>
                                  <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={regenerateParams.cfgWeight}
                                    onChange={(e) => setRegenerateParams(prev => ({ ...prev, cfgWeight: parseFloat(e.target.value) }))}
                                    className="w-full"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-medium mb-1">
                                    Min P: {regenerateParams.minP}
                                  </label>
                                  <input
                                    type="range"
                                    min="0"
                                    max="0.5"
                                    step="0.01"
                                    value={regenerateParams.minP}
                                    onChange={(e) => setRegenerateParams(prev => ({ ...prev, minP: parseFloat(e.target.value) }))}
                                    className="w-full"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-medium mb-1">
                                    Top P: {regenerateParams.topP}
                                  </label>
                                  <input
                                    type="range"
                                    min="0.5"
                                    max="1.0"
                                    step="0.05"
                                    value={regenerateParams.topP}
                                    onChange={(e) => setRegenerateParams(prev => ({ ...prev, topP: parseFloat(e.target.value) }))}
                                    className="w-full"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-medium mb-1">
                                    Repetition Penalty: {regenerateParams.repetitionPenalty}
                                  </label>
                                  <input
                                    type="range"
                                    min="1.0"
                                    max="2.0"
                                    step="0.1"
                                    value={regenerateParams.repetitionPenalty}
                                    onChange={(e) => setRegenerateParams(prev => ({ ...prev, repetitionPenalty: parseFloat(e.target.value) }))}
                                    className="w-full"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-medium mb-1">
                                    Dialogue Text (leave empty to use original)
                                  </label>
                                  <textarea
                                    value={regenerateParams.text}
                                    onChange={(e) => setRegenerateParams(prev => ({ ...prev, text: e.target.value }))}
                                    rows={4}
                                    className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--background)] resize-none"
                                    placeholder={dialogue.text}
                                  />
                                </div>
                              </div>

                              <div className="flex gap-2 mt-4">
                                <button
                                  onClick={() => regenerateAudioFile(dialogue.audioFile!.filename, session.sessionId, dialogue.text)}
                                  className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg transition"
                                  disabled={regeneratingIndex === dialogue.audioFile!.filename}
                                >
                                  {regeneratingIndex === dialogue.audioFile!.filename ? 'Regenerating...' : 'Regenerate Audio'}
                                </button>
                                <button
                                  onClick={() => setShowRegenerateDropdown(null)}
                                  className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded-lg transition"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
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
