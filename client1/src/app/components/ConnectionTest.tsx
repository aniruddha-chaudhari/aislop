'use client';

import { useState } from 'react';
import { API_BASE_URL } from '../../config/api';

export default function ConnectionTest() {
  const [testResult, setTestResult] = useState<string>('');
  const [testing, setTesting] = useState(false);

  const testConnection = async () => {
    setTesting(true);
    setTestResult('');

    try {
      console.log('Testing connection to:', `${API_BASE_URL}/api/audio/test-connection`);
      
      const response = await fetch(`${API_BASE_URL}/api/audio/test-connection`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setTestResult(`✅ Connection successful! ${data.message}`);
    } catch (error: any) {
      console.error('Connection test error:', error);
      setTestResult(`❌ Connection failed: ${error.message}`);
    } finally {
      setTesting(false);
    }
  };

  const testWithDifferentMethods = async () => {
    setTesting(true);
    setTestResult('Testing different connection methods...\n');

    // Test 1: Basic fetch
    try {
      const response = await fetch(`${API_BASE_URL}/api/audio/test-connection`);
      const data = await response.json();
      setTestResult(prev => prev + `✅ Basic fetch: Success\n`);
    } catch (error: any) {
      setTestResult(prev => prev + `❌ Basic fetch: ${error.message}\n`);
    }

    // Test 2: XMLHttpRequest
    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `${API_BASE_URL}/api/audio/test-connection`, true);
        xhr.onload = function() {
          if (xhr.status === 200) {
            setTestResult(prev => prev + `✅ XMLHttpRequest: Success\n`);
            resolve(xhr.responseText);
          } else {
            setTestResult(prev => prev + `❌ XMLHttpRequest: Status ${xhr.status}\n`);
            reject(new Error(`Status ${xhr.status}`));
          }
        };
        xhr.onerror = function() {
          setTestResult(prev => prev + `❌ XMLHttpRequest: Network error\n`);
          reject(new Error('Network error'));
        };
        xhr.send();
      });
    } catch (error: any) {
      setTestResult(prev => prev + `❌ XMLHttpRequest failed: ${error.message}\n`);
    }

    setTesting(false);
  };

  return (
    <div className="bg-[#2F3438] rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-[#F1F1EF] mb-6">
        Connection Test
      </h2>
      
      <div className="space-y-4">
        <div className="flex space-x-4">
          <button
            onClick={testConnection}
            disabled={testing}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-md transition-colors"
          >
            {testing ? 'Testing...' : 'Test Basic Connection'}
          </button>
          
          <button
            onClick={testWithDifferentMethods}
            disabled={testing}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-md transition-colors"
          >
            {testing ? 'Testing...' : 'Test All Methods'}
          </button>
        </div>

        {testResult && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-md">
            <h3 className="font-semibold text-gray-800 dark:text-white mb-2">Test Results:</h3>
            <pre className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
              {testResult}
            </pre>
          </div>
        )}

        <div className="text-sm text-gray-600 dark:text-gray-400">
          <p><strong>Testing URL:</strong> {API_BASE_URL}/api/audio/test-connection</p>
          <p><strong>If requests are blocked:</strong></p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>Disable ad blockers (uBlock Origin, AdBlock Plus, etc.)</li>
            <li>Disable browser extensions temporarily</li>
            <li>Check antivirus web protection settings</li>
            <li>Try opening the URL directly in a new tab</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
