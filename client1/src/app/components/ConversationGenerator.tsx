'use client';

import { useState } from 'react';
import { API_ENDPOINTS, API_BASE_URL } from '../../config/api';
import ImageUpload from './ImageUpload';

interface ConversationItem {
  character: 'Stewie' | 'Peter';
  dialogue: string;
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
    exaggeration: 0.6,
    temperature: 1.5,
    seedNum: 0,
    cfgWeight: 0.4,
    minP: 0.05,
    topP: 1.0,
    repetitionPenalty: 1.2
  });
  const [selectedCharacter, setSelectedCharacter] = useState<'Stewie' | 'Peter'>('Stewie');
  const [ttsParameters, setTtsParameters] = useState({
    exaggeration: 0.6,
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
  const [userImageDecisions, setUserImageDecisions] = useState<Array<{
    userImageLabel: string;
    useImage: boolean;
    reasoning: string;
    timestamp?: number;
  }>>([]);

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
      console.log('Generating conversation with audio...');

      const response = await fetch(API_ENDPOINTS.script, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          text: prompt.trim(),
          exaggeration: 0.6,
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

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();

      if (data.success) {
        setConversation(data.data.conversation);
        setTopic(data.data.topic);
        setAudioFiles(data.audioFiles || []);
        setSessionId(data.sessionId || `session_${Date.now()}`);
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
      console.error('Error generating script:', error);
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
      console.error('Error checking TTS connection:', error);
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
    console.log('Checking TTS connection...');
    const ttsConnected = await checkTTSConnection();
    if (!ttsConnected) {
      setError('TTS API is not available. Please ensure the Chatterbox TTS server is running on port 8000.\n\nYou can start it by running: cd F:\\Aniruddha\\AI\\chatterbox && .venv\\Scripts\\Activate.ps1 && python fastapi_tts_server.py');
      setLoading(false);
      return;
    }

    try {
      console.log('Generating audio for approved script...');
      console.log('Payload trace (frontend):', {
        topic,
        topicLength: topic?.length,
        conversationLines: conversation.length,
        sampleLine: conversation[0]?.dialogue?.slice(0, 80),
        parameters: ttsParameters
      });

      const response = await fetch(API_ENDPOINTS.audioFromScript, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          conversation: {
            conversation,
            topic
          },
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
        console.log('Audio generation successful:', {
          audioFilesCount: data.audioFiles?.length,
          returnedSessionId: data.sessionId,
          currentSessionId: sessionId
        });
        setAudioFiles(data.audioFiles || []);
        setSessionId(data.sessionId || sessionId); // Update sessionId with the real one from database
        if (data.sessionId) {
          localStorage.setItem('audioSessionId', data.sessionId);
        }
        setCurrentStep('audio-generation');
      } else {
        setError('Failed to generate audio files');
      }
    } catch (error) {
      console.error('Error generating audio:', error);
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
    const newItem: ConversationItem = { character: selectedCharacter, dialogue: '' };
    setConversation([...conversation, newItem]);
  };

  const handleDeleteDialogue = (index: number) => {
    const updatedConversation = conversation.filter((_, i) => i !== index);
    setConversation(updatedConversation);
  };

  const handleRestart = () => {
    setCurrentStep('input');
    setConversation([]);
    setTopic('');
    setPrompt('');
    setAudioFiles([]);
    setError('');
    setSuccessMessage('');
    setSessionId('');
    setUserImages([]);
    localStorage.removeItem('audioSessionId');
    setTtsParameters({
      exaggeration: 0.6,
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
      console.log('Generating video with embedded images...');

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
        console.log('Video generation successful:', data);

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

            // Show detailed decisions
            console.log(' User Image Decisions:');
            data.userImageDecisions.forEach((decision, index) => {
              const status = decision.useImage ? ' ACCEPTED' : ' REJECTED';
              console.log(`${index + 1}. ${decision.userImageLabel}: ${status}`);
              console.log(`   Reason: ${decision.reasoning}`);
              if (decision.useImage && decision.timestamp) {
                console.log(`   Will appear at: ${decision.timestamp.toFixed(1)}s`);
              }
              console.log('');
            });
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
      console.error('Error generating video:', error);
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
      console.error('Failed to copy JSON:', err);
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
      for (const item of parsedData.conversation) {
        if (!item.character || !item.dialogue) {
          throw new Error('Invalid conversation item: missing character or dialogue');
        }
        if (!['Stewie', 'Peter'].includes(item.character)) {
          throw new Error('Invalid character: must be Stewie or Peter');
        }
      }

      setConversation(parsedData.conversation);
      setTopic(parsedData.topic || '');
      setPrompt(''); // Clear prompt when importing
      setJsonImportText('');
      setShowJsonImport(false);
      setCurrentStep('script-review'); // Move step change here
      setSuccessMessage('Conversation imported successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Failed to import JSON:', err);
      setError(`Failed to import JSON: ${err instanceof Error ? err.message : 'Invalid JSON format'}`);
    }
  };

  const playAudio = (filename: string) => {
    const audio = new Audio(`${API_BASE_URL}/api/audio/download/${filename}`);
    audio.play().catch(err => {
      console.error('Error playing audio:', err);
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
      const response = await fetch(
        `${API_BASE_URL}/api/audio/regenerate/${sessionId}/${audioFiles[index].filename}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(regenerateParams),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        // Update the audio file timestamp or refresh the list
        // For now, we'll just show success message
        console.log('Audio regenerated successfully');
      } else {
        setError('Failed to regenerate audio');
      }
    } catch (error) {
      console.error('Error regenerating audio:', error);
      setError('Failed to regenerate audio. Please try again.');
    } finally {
      setRegeneratingIndex(null);
      setShowRegenerateDropdown(null);
    }
  };

  const handleDeleteAudio = async (filename: string) => {
    if (!confirm('Are you sure you want to delete this audio file?')) return;

    console.log('Deleting audio file:', { filename, sessionId });

    try {
      const response = await fetch(`${API_BASE_URL}/api/audio/files/${filename}?sessionId=${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Delete response error:', errorData);
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // Remove the deleted audio file from the state
      setAudioFiles(prev => prev.filter(file => file.filename !== filename));

      console.log('Audio file deleted successfully');
    } catch (error) {
      console.error('Error deleting audio file:', error);
      setError('Failed to delete audio file. Please try again.');
    }
  };

  const renderInputStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white mb-4 sm:mb-6">
        Generate New Conversation
      </h2>

      <div>
        <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Enter a technology topic or question:
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., Explain microservices architecture, What is machine learning?, How does Kubernetes work?"
          className="w-full p-2 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none text-sm sm:text-base"
          rows={3}
          disabled={loading}
        />
      </div>

      {/* JSON Import Section */}
      <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 rounded-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 space-y-2 sm:space-y-0">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200">Or Import Conversation from JSON</h3>
          <button
            onClick={() => setShowJsonImport(!showJsonImport)}
            className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-sm rounded-md transition-colors self-start sm:self-auto"
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
              placeholder='Paste your conversation JSON here. Format: {"topic": "Your Topic", "conversation": [{"character": "Stewie", "dialogue": "Hello"}, {"character": "Peter", "dialogue": "Hi"}]}'
              className="w-full p-2 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none text-sm sm:text-base"
              rows={6}
            />
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
              <button
                onClick={handleImportJson}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-md transition-colors text-sm sm:text-base"
              >
                Import & Review Conversation
              </button>
              <button
                onClick={() => {
                  setShowJsonImport(false);
                  setJsonImportText('');
                }}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-md transition-colors text-sm sm:text-base"
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
        className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-medium py-2 sm:py-3 px-4 rounded-md transition-colors duration-200 disabled:cursor-not-allowed text-sm sm:text-base"
      >
        {loading ? (
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
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
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">
          Review Generated Script
        </h2>
        <button
          onClick={handleRestart}
          className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors text-sm sm:text-base self-start sm:self-auto"
        >
          Start Over
        </button>
      </div>

      {topic && (
        <div className="p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <h3 className="text-base sm:text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">Topic:</h3>
          <p className="text-blue-700 dark:text-blue-300 text-sm sm:text-base">{topic}</p>
        </div>
      )}

      {/* JSON Import/Export Section */}
      <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 rounded-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 space-y-2 sm:space-y-0">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200">Import/Export JSON</h3>
          <div className="flex flex-col xs:flex-row space-y-1 xs:space-y-0 xs:space-x-2">
            <button
              onClick={handleCopyJson}
              className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm rounded-md transition-colors"
              title="Copy conversation as JSON"
            >
              Copy JSON
            </button>
            <button
              onClick={() => setShowJsonImport(!showJsonImport)}
              className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs sm:text-sm rounded-md transition-colors"
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
              placeholder='Paste your conversation JSON here. Format: {"topic": "Your Topic", "conversation": [{"character": "Stewie", "dialogue": "Hello"}, {"character": "Peter", "dialogue": "Hi"}]}'
              className="w-full p-2 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none text-sm sm:text-base"
              rows={6}
            />
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
              <button
                onClick={handleImportJson}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-md transition-colors text-sm sm:text-base"
              >
                Import Conversation
              </button>
              <button
                onClick={() => {
                  setShowJsonImport(false);
                  setJsonImportText('');
                }}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-md transition-colors text-sm sm:text-base"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 sm:p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
        <p className="text-yellow-800 dark:text-yellow-200 text-sm sm:text-base">
          <strong>Review the script below:</strong> You can edit any dialogue by clicking on it.
          Once you're satisfied with the script, click "Approve & Generate Audio" to create the audio files.
        </p>
      </div>

      {conversation.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-white">Conversation Script:</h3>
          <div className="space-y-4">
            {conversation.map((item, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-l-4 ${item.character === 'Stewie'
                    ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-400'
                    : 'bg-green-50 dark:bg-green-900/20 border-green-400'
                  }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={`font-semibold text-lg ${item.character === 'Stewie'
                        ? 'text-purple-700 dark:text-purple-300'
                        : 'text-green-700 dark:text-green-300'
                      }`}
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
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
                  rows={3}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col xs:flex-row items-center space-y-2 xs:space-y-0 xs:space-x-4 mb-4">
        <select
          value={selectedCharacter}
          onChange={(e) => setSelectedCharacter(e.target.value as 'Stewie' | 'Peter')}
          className="w-full xs:w-auto px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
        >
          <option value="Stewie">Stewie</option>
          <option value="Peter">Peter</option>
        </select>
        <button
          onClick={handleAddDialogue}
          className="w-full xs:w-auto px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-md transition-colors text-sm sm:text-base"
        >
          Add Dialogue
        </button>
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

  const renderAudioGeneration = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          Audio Generated Successfully!
        </h2>
        <button
          onClick={handleRestart}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
        >
          Generate New
        </button>
      </div>

      {topic && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">Topic:</h3>
          <p className="text-blue-700 dark:text-blue-300">{topic}</p>
        </div>
      )}

      <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
        <p className="text-green-800 dark:text-green-200">
          <strong>Audio files have been generated!</strong> You can now play or download each dialogue segment.
        </p>
      </div>

      {conversation.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Final Conversation with Audio:</h3>
          <div className="space-y-4">
            {conversation.map((item, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-l-4 ${item.character === 'Stewie'
                    ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-400'
                    : 'bg-green-50 dark:bg-green-900/20 border-green-400'
                  }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <span
                    className={`font-semibold text-lg flex-shrink-0 ${item.character === 'Stewie'
                        ? 'text-purple-700 dark:text-purple-300'
                        : 'text-green-700 dark:text-green-300'
                      }`}
                  >
                    {item.character}:
                  </span>
                  {audioFiles.length > 0 && audioFiles[index] && (
                    <div className="flex flex-wrap gap-1 sm:gap-2 mt-2 sm:mt-0">
                      <button
                        onClick={() => playAudio(audioFiles[index].filename)}
                        className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm rounded-md transition-colors flex items-center gap-1 min-w-[60px] sm:min-w-0"
                        title="Play audio"
                      >
                        <span className="text-xs">▶️</span>
                        <span className="hidden sm:inline">Play</span>
                      </button>
                      <button
                        onClick={() => downloadAudio(audioFiles[index].filename)}
                        className="px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white text-xs sm:text-sm rounded-md transition-colors flex items-center gap-1 min-w-[60px] sm:min-w-0"
                        title="Download audio"
                      >
                        <span className="text-xs">⬇️</span>
                        <span className="hidden sm:inline">Download</span>
                      </button>
                      <button
                        onClick={() => {
                          console.log('Current sessionId:', sessionId);
                          console.log('Audio file to delete:', audioFiles[index].filename);
                          handleDeleteAudio(audioFiles[index].filename);
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
                  )}
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

  const renderVideoGeneration = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          Generate Video with Images
        </h2>
        <button
          onClick={() => setCurrentStep('audio-generation')}
          className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors"
        >
          ← Back to Audio
        </button>
      </div>

      {topic && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">Topic:</h3>
          <p className="text-blue-700 dark:text-blue-300">{topic}</p>
        </div>
      )}

      <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-md">
        <p className="text-purple-800 dark:text-purple-200">
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
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-4">
            🤖 AI Image Evaluation Results
          </h3>
          <div className="space-y-3">
            {userImageDecisions.map((decision, index) => (
              <div key={index} className={`p-3 rounded-md border ${decision.useImage
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">
                    {decision.userImageLabel}
                  </h4>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${decision.useImage
                      ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                      : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                    }`}>
                    {decision.useImage ? ' ACCEPTED' : ' REJECTED'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <strong>AI Reasoning:</strong> {decision.reasoning}
                </p>
                {decision.useImage && decision.timestamp && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
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
          className="flex-1 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-md transition-colors duration-200 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span>Generating Video...</span>
            </div>
          ) : (
            ' Generate Video'
          )}
        </button>
        <button
          onClick={handleRestart}
          disabled={loading}
          className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-md transition-colors"
        >
          Start Over
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-[#2F3438] rounded-lg shadow-lg p-3 sm:p-6">
      {/* Error Display */}
      {error && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-red-600 dark:text-red-400 text-sm sm:text-base whitespace-pre-line">{error}</p>
        </div>
      )}

      {/* Success Display */}
      {successMessage && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
          <p className="text-green-600 dark:text-green-400 text-sm sm:text-base">{successMessage}</p>
        </div>
      )}

      {/* Step Progress Indicator */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center justify-between">
          <div className={`flex-1 text-center text-xs sm:text-sm ${currentStep === 'input' ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
            <span className="hidden sm:inline">1. Enter Prompt</span>
            <span className="sm:hidden">Prompt</span>
          </div>
          <div className={`flex-1 text-center text-xs sm:text-sm ${currentStep === 'script-review' ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
            <span className="hidden sm:inline">2. Review Script</span>
            <span className="sm:hidden">Review</span>
          </div>
          <div className={`flex-1 text-center text-xs sm:text-sm ${currentStep === 'audio-generation' ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
            <span className="hidden sm:inline">3. Audio Generated</span>
            <span className="sm:hidden">Audio</span>
          </div>
          <div className={`flex-1 text-center text-xs sm:text-sm ${currentStep === 'video-generation' ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
            <span className="hidden sm:inline">4. Video Generation</span>
            <span className="sm:hidden">Video</span>
          </div>
        </div>
        <div className="mt-2 bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
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
