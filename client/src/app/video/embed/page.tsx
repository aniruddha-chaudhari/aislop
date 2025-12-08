'use client';

import ImageEmbedder from '../../components/ImageEmbedder';

export default function ImageEmbedPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-4">
              🎨 Image Embedding Studio
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              Enhance your videos with intelligent image overlays. Upload your ASS subtitle file and let AI analyze
              the dialogue to determine the perfect moments for visual elements that will make your content more engaging.
            </p>
          </div>

          {/* How it works */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">🚀 How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">📄</span>
                </div>
                <h3 className="font-semibold text-gray-800 dark:text-white mb-2">1. Upload ASS File</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Upload your subtitle file (.ass format) containing the dialogue and timing information.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🤖</span>
                </div>
                <h3 className="font-semibold text-gray-800 dark:text-white mb-2">2. AI Analysis</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  AI analyzes the dialogue to identify key moments that would benefit from visual enhancement.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🖼️</span>
                </div>
                <h3 className="font-semibold text-gray-800 dark:text-white mb-2">3. Upload Images</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Upload the suggested images and track progress until all requirements are fulfilled.
                </p>
              </div>
            </div>
          </div>

          {/* Image Embedder Component */}
          <ImageEmbedder />
        </div>
      </div>
    </div>
  );
}
