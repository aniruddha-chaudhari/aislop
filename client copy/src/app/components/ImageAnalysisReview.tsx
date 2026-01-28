'use client';

import { useState } from 'react';
import { API_ENDPOINTS } from '../../config/api';

interface UserImageSuggestion {
  userImageId: string;
  userImageLabel: string;
  suggestedTimestamp: number;
  dialogueIndex: number;
  dialogueText: string;
  character: string;
  reasoning: string;
  relevanceScore: number;
  suggestedDuration: number;
  alternativePlacements: Array<{
    timestamp: number;
    dialogueIndex: number;
    reasoning: string;
    score: number;
  }>;
}

interface UserProvidedImage {
  id: string;
  imagePath: string;
  label: string;
  description?: string;
  preferredTimestamp?: number;
  priority?: 'high' | 'medium' | 'low';
}

interface ImageAnalysisData {
  sessionId: string;
  topic: string;
  analysisDate: string;
  userImages: UserProvidedImage[];
  suggestions: UserImageSuggestion[];
  totalSuggestions: number;
  summary: {
    totalSuggestions: number;
    highRelevance: number;
    mediumRelevance: number;
    lowRelevance: number;
    averageRelevance: string;
  };
}

interface ImageAnalysisReviewProps {
  sessionId: string;
  topic: string;
  userImages: UserProvidedImage[];
  onApprovalComplete: (approvedPlacements: UserImageSuggestion[]) => void;
  onBack: () => void;
}

export default function ImageAnalysisReview({
  sessionId,
  topic,
  userImages,
  onApprovalComplete,
  onBack
}: ImageAnalysisReviewProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState<ImageAnalysisData | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [approvedPlacements, setApprovedPlacements] = useState<Set<string>>(new Set());
  const [generatingVideo, setGeneratingVideo] = useState(false);

  // New states for copy/paste functionality
  const [showAssContent, setShowAssContent] = useState(false);
  const [assContent, setAssContent] = useState('');
  const [loadingAss, setLoadingAss] = useState(false);
  const [showPasteInterface, setShowPasteInterface] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [copySuccess, setCopySuccess] = useState('');
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Set<string>>(new Set());

  const toggleReasoningExpansion = (suggestionId: string) => {
    const newExpanded = new Set(expandedReasoningIds);
    if (newExpanded.has(suggestionId)) {
      newExpanded.delete(suggestionId);
    } else {
      newExpanded.add(suggestionId);
    }
    setExpandedReasoningIds(newExpanded);
  };

  const startAnalysis = async () => {
    setAnalyzing(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(API_ENDPOINTS.analyzeUserImages, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          topic
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze images');
      }

      const data = await response.json();

      if (data.success) {
        // Backends may return either { analysis: { suggestions, summary }} or { suggestions }
        const suggestions = data.analysis?.suggestions || data.suggestions || [];
        const summary = data.analysis?.summary || data.summary || {};
        setAnalysisData({
          sessionId,
          topic,
          analysisDate: new Date().toISOString(),
          userImages,
          suggestions,
          totalSuggestions: suggestions.length,
          summary
        });
        setSuccess(`Analysis complete! Found ${suggestions.length} potential placements.`);
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('Error analyzing images:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze images');
    } finally {
      setAnalyzing(false);
    }
  };

  const togglePlacementApproval = (suggestionId: string) => {
    const newApproved = new Set(approvedPlacements);
    if (newApproved.has(suggestionId)) {
      newApproved.delete(suggestionId);
    } else {
      newApproved.add(suggestionId);
    }
    setApprovedPlacements(newApproved);
  };

  const approveAllHighRelevance = () => {
    if (!analysisData) return;

    const highRelevanceSuggestions = analysisData.suggestions
      .filter(s => s.relevanceScore >= 0.8)
      .map(s => s.userImageId);

    setApprovedPlacements(new Set(highRelevanceSuggestions));
  };

  const clearAllApprovals = () => {
    setApprovedPlacements(new Set());
  };

  const proceedWithApprovedPlacements = () => {
    if (!analysisData) return;

    const approvedSuggestions = analysisData.suggestions.filter(suggestion =>
      approvedPlacements.has(suggestion.userImageId)
    );

    onApprovalComplete(approvedSuggestions);
  };

  // New copy/paste functions
  const copyCurrentSuggestionsJSON = async () => {
    if (!analysisData) return;

    const dataToExport = {
      sessionId,
      topic,
      exportDate: new Date().toISOString(),
      suggestions: analysisData.suggestions,
      approvedPlacements: Array.from(approvedPlacements),
      summary: analysisData.summary,
      userImages: userImages.map(img => ({
        id: img.id,
        label: img.label,
        description: img.description,
        preferredTimestamp: img.preferredTimestamp
      }))
    };

    const jsonText = JSON.stringify(dataToExport, null, 2);

    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(jsonText);
        setCopySuccess('✅ JSON copied to clipboard!');
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = jsonText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          const successful = document.execCommand('copy');
          if (successful) {
            setCopySuccess('✅ JSON copied to clipboard!');
          } else {
            throw new Error('execCommand failed');
          }
        } catch (fallbackError) {
          throw fallbackError;
        } finally {
          document.body.removeChild(textArea);
        }
      }
      setTimeout(() => setCopySuccess(''), 3000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      setCopySuccess('❌ Failed to copy. Please select and copy manually.');
      setTimeout(() => setCopySuccess(''), 5000);
    }
  };

  const loadAssContent = async () => {
    setLoadingAss(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.getAssContent}?sessionId=${sessionId}`);
      if (!response.ok) {
        throw new Error('Failed to load ASS content');
      }
      const data = await response.json();
      setAssContent(data.content);
      setShowAssContent(true);
    } catch (error) {
      setError(`Failed to load ASS content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingAss(false);
    }
  };

  const copyAssContent = async () => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(assContent);
        setCopySuccess('✅ ASS content copied to clipboard!');
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = assContent;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          const successful = document.execCommand('copy');
          if (successful) {
            setCopySuccess('✅ ASS content copied to clipboard!');
          } else {
            throw new Error('execCommand failed');
          }
        } catch (fallbackError) {
          throw fallbackError;
        } finally {
          document.body.removeChild(textArea);
        }
      }
      setTimeout(() => setCopySuccess(''), 3000);
    } catch (error) {
      console.error('Failed to copy ASS content:', error);
      setCopySuccess('❌ Failed to copy ASS content');
      setTimeout(() => setCopySuccess(''), 3000);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        const clipboardText = await navigator.clipboard.readText();
        setPasteText(clipboardText);
      } else {
        setError('Clipboard access not available. Please paste manually into the text area below.');
      }
    } catch (error) {
      console.error('Failed to paste from clipboard:', error);
      setError('Failed to paste from clipboard. Please paste manually into the text area below.');
    }
  };

  const applyCustomSuggestions = async () => {
    if (!pasteText.trim()) {
      setError('Please enter JSON data to apply');
      return;
    }

    try {
      const customData = JSON.parse(pasteText);

      // Basic validation
      if (!customData.suggestions || !Array.isArray(customData.suggestions)) {
        throw new Error('Invalid format: missing "suggestions" array');
      }

      const response = await fetch(API_ENDPOINTS.uploadCustomSuggestions, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          customData
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to apply custom suggestions');
      }

      const result = await response.json();

      // Update the analysis data with the new custom suggestions
      if (result.success && customData.suggestions) {
        setAnalysisData({
          ...analysisData!,
          suggestions: customData.suggestions,
          summary: customData.summary || analysisData!.summary
        });

        // Update approved placements if provided
        if (customData.approvedPlacements && Array.isArray(customData.approvedPlacements)) {
          setApprovedPlacements(new Set(customData.approvedPlacements));
        }

        setSuccess('✅ Custom suggestions applied successfully!');
        setShowPasteInterface(false);
        setPasteText('');
      }
    } catch (error) {
      console.error('Error applying custom suggestions:', error);
      setError(error instanceof Error ? error.message : 'Failed to apply custom suggestions');
    }
  };

  const cancelPaste = () => {
    setShowPasteInterface(false);
    setPasteText('');
  };

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRelevanceColor = (score: number): string => {
    if (score >= 0.8) return 'text-[#448361] bg-[#EDF3EC]';
    if (score >= 0.6) return 'text-[#CB912F] bg-[#FBF3DB]';
    return 'text-[#D44C47] bg-[#FDEBEC]';
  };

  const getRelevanceLabel = (score: number): string => {
    if (score >= 0.8) return 'High Relevance';
    if (score >= 0.6) return 'Medium Relevance';
    return 'Low Relevance';
  };

  return (
    <div className="max-w-6xl mx-auto p-0 sm:p-6 space-y-2 sm:space-y-6">
      {/* Header */}
      <div className="bg-[#2F3438] border border-[#787774]/20 rounded-lg shadow-lg p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
          <h2 className="text-base sm:text-2xl font-bold text-[#F1F1EF]">🔍 Analysis & Approval</h2>
          <button
            onClick={onBack}
            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-[#787774] hover:bg-[#787774]/80 text-[#F1F1EF] rounded-md transition-colors self-start sm:self-auto text-sm"
          >
            ← Back
          </button>
        </div>

        <div className="bg-[#E7F3F8] border border-[#337EA9]/20 rounded-md p-2 sm:p-4">
          <p className="text-[#37352F] mb-1 sm:mb-2 text-xs sm:text-sm">
            <strong>Session:</strong> {sessionId} | <strong>Topic:</strong> {topic}
          </p>
          <p className="text-[#337EA9] text-xs sm:text-sm">
            📸 Images: {userImages.length} | AI will analyze for relevance
          </p>
        </div>

        {!analysisData && (
          <div className="mt-6">
            <button
              onClick={startAnalysis}
              disabled={analyzing || userImages.length === 0}
              className="px-6 py-3 bg-[#337EA9] hover:bg-[#337EA9]/80 disabled:bg-[#787774]/50 text-[#F1F1EF] font-medium rounded-md transition-colors"
            >
              {analyzing ? '🔄 Analyzing Images...' : '🎯 Start AI Analysis'}
            </button>

            {userImages.length === 0 && (
              <p className="text-[#D44C47] text-sm mt-2">
                Please upload images first before starting analysis.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-[#FDEBEC] border border-[#D44C47]/20 rounded-md p-4">
          <p className="text-[#D44C47]">❌ {error}</p>
        </div>
      )}

      {success && (
        <div className="bg-[#EDF3EC] border border-[#448361]/20 rounded-md p-4">
          <p className="text-[#448361]">✅ {success}</p>
        </div>
      )}

      {/* Analysis Results */}
      {analysisData && (
        <>
          {/* Summary */}
          <div className="bg-[#2F3438] border border-[#787774]/20 rounded-lg shadow-lg p-3 sm:p-6">
            <h3 className="text-lg sm:text-xl font-semibold text-[#F1F1EF] mb-3 sm:mb-4">📊 Analysis Summary</h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-[#E7F3F8] border border-[#337EA9]/20 p-4 rounded-md text-center">
                <div className="text-2xl font-bold text-[#337EA9]">{analysisData.summary.totalSuggestions}</div>
                <div className="text-sm text-[#37352F]">Total Suggestions</div>
              </div>

              <div className="bg-[#EDF3EC] border border-[#448361]/20 p-4 rounded-md text-center">
                <div className="text-2xl font-bold text-[#448361]">{analysisData.summary.highRelevance}</div>
                <div className="text-sm text-[#37352F]">High Relevance</div>
              </div>

              <div className="bg-[#FBF3DB] border border-[#CB912F]/20 p-4 rounded-md text-center">
                <div className="text-2xl font-bold text-[#CB912F]">{analysisData.summary.mediumRelevance}</div>
                <div className="text-sm text-[#37352F]">Medium Relevance</div>
              </div>

              <div className="bg-[#FDEBEC] border border-[#D44C47]/20 p-4 rounded-md text-center">
                <div className="text-2xl font-bold text-[#D44C47]">{analysisData.summary.lowRelevance}</div>
                <div className="text-sm text-[#37352F]">Low Relevance</div>
              </div>
            </div>

            {/* Bulk Actions */}
            <div className="flex flex-col gap-2 mb-4">
              <div className="flex gap-2">
                <button
                  onClick={approveAllHighRelevance}
                  className="px-2 py-1.5 bg-[#448361] hover:bg-[#448361]/80 text-[#F1F1EF] text-xs rounded-md transition-colors flex-1"
                >
                  ✅ All High
                </button>

                <button
                  onClick={clearAllApprovals}
                  className="px-2 py-1.5 bg-[#D44C47] hover:bg-[#D44C47]/80 text-[#F1F1EF] text-xs rounded-md transition-colors flex-1"
                >
                  ❌ Clear All
                </button>
              </div>

              <div className="text-xs text-[#787774] text-center">
                {approvedPlacements.size} of {analysisData.suggestions.length} approved
              </div>
            </div>

            {/* Copy & Paste Management Section */}
            <div className="border-t border-[#787774]/30 pt-6 mt-6">
              <h4 className="text-lg font-semibold text-[#F1F1EF] mb-4">📋 Copy & Paste Management</h4>

              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={loadAssContent}
                  disabled={loadingAss}
                  className="px-2 py-1.5 bg-[#337EA9] hover:bg-[#337EA9]/80 disabled:bg-[#787774]/50 text-[#F1F1EF] text-xs rounded-md transition-colors text-center"
                >
                  {loadingAss ? '⏳ Loading...' : '👁️ View ASS'}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={copyCurrentSuggestionsJSON}
                    className="px-2 py-1.5 bg-[#9065B0] hover:bg-[#9065B0]/80 text-[#F1F1EF] text-xs rounded-md transition-colors text-center"
                  >
                    📋 Copy
                  </button>

                  <button
                    onClick={() => setShowPasteInterface(true)}
                    className="px-2 py-1.5 bg-[#D9730D] hover:bg-[#D9730D]/80 text-[#F1F1EF] text-xs rounded-md transition-colors text-center"
                  >
                    📋 Paste
                  </button>
                </div>
              </div>

              {/* Copy Success Message */}
              {copySuccess && (
                <div className="mt-3 p-3 bg-[#EDF3EC] border border-[#448361]/20 rounded-md">
                  <p className="text-[#448361] text-sm">{copySuccess}</p>
                </div>
              )}
            </div>
          </div>

          {/* ASS Content Viewer */}
          {showAssContent && (
            <div className="bg-[#2F3438] border border-[#787774]/20 rounded-lg shadow-lg p-3 sm:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="text-lg sm:text-xl font-semibold text-[#F1F1EF]">📄 ASS Subtitle Content</h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={copyAssContent}
                    className="px-3 py-1.5 sm:px-4 sm:py-2 bg-[#337EA9] hover:bg-[#337EA9]/80 text-[#F1F1EF] text-xs sm:text-sm rounded-md transition-colors"
                  >
                    📋 Copy ASS
                  </button>
                  <button
                    onClick={() => setShowAssContent(false)}
                    className="px-3 py-1.5 sm:px-4 sm:py-2 bg-[#787774] hover:bg-[#787774]/80 text-[#F1F1EF] text-xs sm:text-sm rounded-md transition-colors"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>

              <div className="bg-[#F1F1EF] border border-[#787774]/20 rounded-md p-4 max-h-96 overflow-y-auto">
                <pre className="text-sm text-[#37352F] font-mono whitespace-pre-wrap">
                  {assContent}
                </pre>
              </div>
            </div>
          )}

          {/* Paste Interface */}
          {showPasteInterface && (
            <div className="bg-[#2F3438] border border-[#787774]/20 rounded-lg shadow-lg p-3 sm:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="text-lg sm:text-xl font-semibold text-[#F1F1EF]">📋 Paste Custom Suggestions</h3>
                <button
                  onClick={cancelPaste}
                  className="px-4 py-2 bg-[#787774] hover:bg-[#787774]/80 text-[#F1F1EF] text-sm rounded-md transition-colors"
                >
                  ✕ Cancel
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={pasteFromClipboard}
                    className="px-4 py-2 bg-[#337EA9] hover:bg-[#337EA9]/80 text-[#F1F1EF] text-sm rounded-md transition-colors"
                  >
                    📋 From Clipboard
                  </button>
                  <span className="text-sm text-[#787774]">or paste JSON manually below:</span>
                </div>

                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste your custom suggestions JSON here..."
                  className="w-full h-40 p-3 border border-[#787774]/30 bg-[#2F3438] text-[#F1F1EF] rounded-md font-mono text-sm resize-vertical placeholder-[#787774]"
                />

                <div className="text-xs text-[#787774] bg-[#F1F1EF] p-3 rounded-md">
                  <strong>Expected format:</strong> JSON with "suggestions" array containing placement data with userImageId, suggestedTimestamp, relevanceScore, etc.
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={applyCustomSuggestions}
                    disabled={!pasteText.trim()}
                    className="px-4 py-2 bg-[#448361] hover:bg-[#448361]/80 disabled:bg-[#787774]/50 text-[#F1F1EF] text-sm rounded-md transition-colors flex-1 sm:flex-none"
                  >
                    ✅ Apply Custom Suggestions
                  </button>
                  <button
                    onClick={() => setPasteText('')}
                    className="px-4 py-2 bg-[#CB912F] hover:bg-[#CB912F]/80 text-[#F1F1EF] text-sm rounded-md transition-colors flex-1 sm:flex-none"
                  >
                    🗑️ Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Suggestions List */}
          <div className="bg-[#2F3438] border border-[#787774]/20 rounded-lg shadow-lg p-3 sm:p-6">
            <h3 className="text-lg sm:text-xl font-semibold text-[#F1F1EF] mb-3 sm:mb-4">🎬 Suggested Image Placements</h3>

            <div className="space-y-3 sm:space-y-4">
              {analysisData.suggestions.map((suggestion, index) => (
                <div
                  key={suggestion.userImageId}
                  className={`border-2 rounded-lg p-3 sm:p-4 transition-all ${approvedPlacements.has(suggestion.userImageId)
                      ? 'border-[#448361] bg-[#EDF3EC]/20'
                      : 'border-[#787774]/30 hover:border-[#337EA9]/50 bg-[#3F4448]'
                    }`}
                >
                  <div className="flex flex-col space-y-3">
                    {/* Image Info Row */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[#787774]/20 rounded-md flex items-center justify-center flex-shrink-0">
                          <span className="text-lg sm:text-2xl">🖼️</span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-[#F1F1EF] text-sm sm:text-base truncate">{suggestion.userImageLabel}</h4>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-1 sm:space-y-0 mt-1">
                            <span className={`px-2 py-1 text-xs rounded-full self-start ${getRelevanceColor(suggestion.relevanceScore)}`}>
                              {getRelevanceLabel(suggestion.relevanceScore)} ({(suggestion.relevanceScore * 100).toFixed(0)}%)
                            </span>
                            <span className="text-xs sm:text-sm text-[#787774]">
                              Show at {formatTimestamp(suggestion.suggestedTimestamp)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Approval Button - Now in top right */}
                      <button
                        onClick={() => togglePlacementApproval(suggestion.userImageId)}
                        className={`px-2 py-1 sm:px-4 sm:py-2 rounded-md font-medium text-xs sm:text-sm transition-all flex-shrink-0 ml-2 ${approvedPlacements.has(suggestion.userImageId)
                            ? 'bg-[#448361] hover:bg-[#448361]/80 text-[#F1F1EF]'
                            : 'bg-[#787774]/20 hover:bg-[#787774]/30 text-[#F1F1EF]'
                          }`}
                      >
                        {approvedPlacements.has(suggestion.userImageId) ? '✅' : '👆'}
                      </button>
                    </div>

                    {/* Dialogue Context */}
                    <div className="bg-[#F1F1EF] rounded-md p-2 sm:p-3">
                      <div className="text-xs sm:text-sm text-[#787774] mb-1">
                        <strong>{suggestion.character}:</strong>
                      </div>
                      <div className="text-xs sm:text-sm text-[#37352F] italic">
                        "{suggestion.dialogueText}"
                      </div>
                    </div>

                    {/* AI Reasoning with Show More */}
                    <div className="bg-[#E7F3F8] rounded-md p-2 sm:p-3">
                      <div className="text-xs sm:text-sm text-[#337EA9]">
                        <strong>🤖 AI Reasoning:</strong>{' '}
                        {suggestion.reasoning.length > 100 ? (
                          <>
                            {expandedReasoningIds.has(suggestion.userImageId)
                              ? suggestion.reasoning
                              : `${suggestion.reasoning.substring(0, 100)}...`}
                            <button
                              onClick={() => toggleReasoningExpansion(suggestion.userImageId)}
                              className="ml-2 text-[#337EA9] hover:text-[#337EA9]/80 underline text-xs"
                            >
                              {expandedReasoningIds.has(suggestion.userImageId) ? 'Show Less' : 'Show More'}
                            </button>
                          </>
                        ) : (
                          suggestion.reasoning
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          {approvedPlacements.size > 0 && (
            <div className="bg-[#2F3438] border border-[#787774]/20 rounded-lg shadow-lg p-2 sm:p-6">
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="text-sm sm:text-lg font-semibold text-[#F1F1EF] text-center sm:text-left">🎯 Ready to generate!</h3>
                  <p className="text-[#787774] text-xs sm:text-sm text-center sm:text-left">
                    Video with subtitles and {approvedPlacements.size} approved images.
                  </p>
                </div>

                <button
                  onClick={proceedWithApprovedPlacements}
                  disabled={generatingVideo}
                  className="px-3 py-2.5 bg-[#448361] hover:bg-[#448361]/80 disabled:bg-[#787774]/50 text-[#F1F1EF] font-medium text-sm rounded-md transition-colors w-full"
                >
                  {generatingVideo ? '🎬 Generating...' : '🎬 Proceed & Generate Video'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
