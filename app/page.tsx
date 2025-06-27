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

  const appendLog = (msg: string) => setLog((prev) => [...prev, msg]);

  const handleDownload = async () => {
    setLoading(true);
    setLog([]);
    //setDisplayData([]);

    let skip = 0;
    let chunk = 0;
    let accumulatedData: any[] = [];
    let jsonChunks: { name: string, content: string }[] = [];
    let zipIndex = 0;
    let currentZip = new JSZip();

    try {
      while (true) {
        appendLog(`Fetching skip=${skip}...`);

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
          
         
          // Check if we should download based on frequency (for both regular and final batches)
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
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unknown error occurred';
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

      <div className="mt-6 bg-gray-100 p-3 rounded text-sm h-64">
       
        {log.map((entry, i) => (
          <div key={i}>{entry}</div>
        ))}
      </div>
    </div>
    </div>
  );
}
