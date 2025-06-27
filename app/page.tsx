'use client';

import { useState } from 'react';
import JSZip from 'jszip';

export default function Home() {
  const [subgraphId, setSubgraphId] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  //const [displayData, setDisplayData] = useState<string[]>([]);
  const [downloadFrequency, setDownloadFrequency] = useState<number>(5); // Download every 5 skips (5000 records)
  const [zipFileName, setZipFileName] = useState<string>('data.zip'); // New state for zip file name
  const [progress, setProgress] = useState<{ percentage: number; recordsFetched: number; estimatedTime: string }>({
    percentage: 0,
    recordsFetched: 0,
    estimatedTime: 'Calculating...'
  });

  const appendLog = (msg: string) => setLog((prev) => [...prev, msg]);

  const handleDownload = async () => {
    setLoading(true);
    setLog([]);
    setProgress({ percentage: 0, recordsFetched: 0, estimatedTime: 'Calculating...' });

    let skip = 0;
    let chunk = 0;
    let accumulatedData: any[] = [];
    let jsonChunks: { name: string, content: string }[] = [];
    let zipIndex = 0;
    let currentZip = new JSZip();
    let totalRecordsFetched = 0;
    let startTime = Date.now();

    try {
      while (true) {
        const res = await fetch('/api/fetch-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subgraphId, apiKey, query, skip }),
        });

        const data = await res.json();
        console.log('Full response data:', data);
        const entityData: Record<string, unknown[]> = data?.data;
        console.log('Entity data:', entityData);
        
        if (
          !res.ok ||
          !entityData ||
          Object.values(entityData).every(
            (arr) => !Array.isArray(arr) || arr.length === 0
          )
        ) {
          appendLog('No more data or all results empty. Stopping.');
          break;
        }
      
        const values = Object.values(entityData);
        console.log('Values array:', values);
        
        const currentBatch = values[0];
        console.log('Current batch:', currentBatch);
        
        console.log('Before concat - accumulatedData length:', accumulatedData.length);
        console.log('Current batch to add:', currentBatch.length, 'items');
        
        // Add current batch to accumulated data
        accumulatedData = accumulatedData.concat(currentBatch);
        totalRecordsFetched += currentBatch.length;
        
        console.log('After concat - accumulatedData length:', accumulatedData.length);
        console.log('First few items in accumulated data:', accumulatedData.slice(0, 3));
        
        // Skip-based progress calculation
        let percentage = 0;
        let estimatedTime = 'Calculating...';
        
        // After first few batches, estimate total skips needed
        if (skip >= 3000 && currentBatch.length === 1000) {
          // If we're still getting full batches after 3000 skips, estimate more
          const estimatedTotalSkips =  skip * 2; // Conservative estimate
          percentage = Math.min((skip / estimatedTotalSkips) * 100, 95);
        } else if (skip >= 1000 && currentBatch.length === 1000) {
          // After first batch, make initial estimate
          const estimatedTotalSkips = skip + 500; // Conservative estimate
          percentage = Math.min((skip / estimatedTotalSkips) * 100, 90);
        } else if (skip === 0) {
          percentage = 5; // Just started
        } else {
          // Use a simple linear estimate
          percentage = Math.min((skip / 10000) * 100, 80); // Assume at least 10,000 skips
        }
        
        // Calculate estimated time based on current speed
        const elapsedTime = (Date.now() - startTime) / 1000; // seconds
        if (elapsedTime > 0 && skip > 0) {
          const skipsPerSecond = skip / elapsedTime;
          const remainingSkips =  skip * 0.5; // Estimate remaining skips
          const remainingSeconds = remainingSkips / skipsPerSecond;
          
          if (remainingSeconds < 60) {
            estimatedTime = `${Math.round(remainingSeconds)}s remaining`;
          } else if (remainingSeconds < 3600) {
            estimatedTime = `${Math.round(remainingSeconds / 60)}m remaining`;
          } else {
            estimatedTime = `${Math.round(remainingSeconds / 3600)}h remaining`;
          }
        }
        
        setProgress({
          percentage: Math.round(percentage),
          recordsFetched: totalRecordsFetched,
          estimatedTime
        });
        
        // Check if we should download based on frequency
        if (accumulatedData.length > 0 && (skip / 1000) % downloadFrequency === 0 && skip > 0) {
          jsonChunks.push({ name: `chunk_${chunk}.json`, content: JSON.stringify({ data: accumulatedData }, null, 2) });
          currentZip.file(`chunk_${chunk}.json`, JSON.stringify({ data: accumulatedData }, null, 2));
          
          // Reset accumulated data and increment chunk counter
          accumulatedData = [];
          chunk += 1;
        }
        
        if (currentBatch.length < 1000) {
          appendLog(`Final batch received with ${currentBatch.length} entries`);
          if (accumulatedData.length > 0) {
            jsonChunks.push({ name: `chunk_${chunk}.json`, content: JSON.stringify({ data: accumulatedData }, null, 2) });
            currentZip.file(`chunk_${chunk}.json`, JSON.stringify({ data: accumulatedData }, null, 2));
          }
          break;
        }

        skip += 1000;
      }

      // Download final zip
      if (Object.keys(currentZip.files).length > 0) {
        const zipBlob = await currentZip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        const zipPartName = zipFileName.replace(/\.zip$/, '') + `_part${zipIndex}.zip`;
        a.href = url;
        a.download = zipPartName;
        a.click();
        URL.revokeObjectURL(url);
        appendLog(`Downloaded zip file: ${zipPartName} (size: ${(zipBlob.size / (1024*1024)).toFixed(2)} MB)`);
      }
      
      setProgress({ percentage: 100, recordsFetched: totalRecordsFetched, estimatedTime: 'Complete!' });
      appendLog(`Process completed! Total records fetched: ${totalRecordsFetched.toLocaleString()}`);
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      appendLog(`Error: ${message}`);
    }

    setLoading(false);
  };

  return (
    <div className='min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 space-y-6'>
    <div className='w-full max-w-md space-y-4'>
      
      <input
        type="text"
        placeholder="Enter API Key"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        className="w-full p-2 border rounded"
      />
      <input
        type="text"
        placeholder="Enter Subgraph ID"
        value={subgraphId}
        onChange={(e) => setSubgraphId(e.target.value)}
        className="w-full p-2 border rounded"
      />

      <div className="flex items-center space-x-2">
        <label className="text-sm font-medium">Download every:</label>
        <input
          type="number"
          min="1"
          max="20"
          value={downloadFrequency}
          onChange={(e) => setDownloadFrequency(parseInt(e.target.value) || 1)}
          className="w-20 p-2 border rounded"
        />
        <span className="text-sm text-gray-600">skips ({downloadFrequency * 1000} records)</span>
      </div>

      <textarea
        rows={8}
        placeholder="Enter your GraphQL query here..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full p-3 font-mono text-sm bg-gray-900 text-green-200 border border-gray-700 rounded shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
<div className='text-sm text-gray-500'>
    URL Preview:
    <br/>
    <span className="text-blue-600 font-mono">
       https://gateway.thegraph.com/api/{apiKey || '[api-key]'}/subgraphs/id/{subgraphId || '[subgraph-id]'}
    </span>
  </div>
      <input
        type="text"
        placeholder="Enter zip file name"
        value={zipFileName}
        onChange={e => setZipFileName(e.target.value)}
        className="w-full p-2 border rounded"
      />
      <button
        onClick={handleDownload}
        className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded hover:bg-blue-700"
        disabled={loading}
      >
        {loading ? 'Downloading...' : 'Start Download'}
      </button>

      {/* Progress Bar */}
      {loading && (
        <div className="mt-4 p-4 bg-white rounded-lg shadow border">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              Progress: {progress.percentage}%
            </span>
            <span className="text-sm text-gray-500">
              {progress.estimatedTime}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
          <div className="mt-2 text-sm text-gray-600">
            Records fetched: {progress.recordsFetched.toLocaleString()}
          </div>
        </div>
      )}

      <div className="mt-6 bg-gray-100 p-3 rounded text-sm h-64">
       
        {log.map((entry, i) => (
          <div key={i}>{entry}</div>
        ))}
      </div>
    </div>
    </div>
  );
}
