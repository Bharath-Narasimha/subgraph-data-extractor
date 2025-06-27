'use client';

import { useState } from 'react';
import JSZip from 'jszip';

export default function Home() {
  const [apiKey, setApiKey] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [downloadFrequency, setDownloadFrequency] = useState<number>(5);
  const [progress, setProgress] = useState<{ percentage: number; recordsFetched: number; estimatedTime: string }>({
    percentage: 0,
    recordsFetched: 0,
    estimatedTime: 'Calculating...'
  });
  const [subgraphs, setSubgraphs] = useState<Array<{ id: string; fileName: string }>>([
    { id: '', fileName: 'data.zip' }
  ]);
  const [subgraphProgress, setSubgraphProgress] = useState<Array<{ percentage: number; recordsFetched: number; estimatedTime: string; status: string }>>([
    { percentage: 0, recordsFetched: 0, estimatedTime: 'Calculating...', status: 'Waiting' }
  ]);

  const appendLog = (msg: string) => setLog((prev) => [...prev, msg]);

  const addSubgraph = () => {
    setSubgraphs([...subgraphs, { id: '', fileName: 'data.zip' }]);
  };

  const removeSubgraph = (index: number) => {
    if (subgraphs.length > 1) {
      setSubgraphs(subgraphs.filter((_, i) => i !== index));
    }
  };

  const updateSubgraph = (index: number, field: 'id' | 'fileName', value: string) => {
    const updated = [...subgraphs];
    updated[index][field] = value;
    setSubgraphs(updated);
  };

  const handleDownload = async () => {
    setLoading(true);
    setLog([]);
    setProgress({ percentage: 0, recordsFetched: 0, estimatedTime: 'Calculating...' });
    setSubgraphProgress(
      subgraphs.map(() => ({ percentage: 0, recordsFetched: 0, estimatedTime: 'Calculating...', status: 'Downloading' }))
    );

    let totalRecordsFetched = 0;
    let startTime = Date.now();

    try {
      await Promise.all(subgraphs.map(async (subgraph, subgraphIdx) => {
        if (!subgraph.id.trim()) {
          setSubgraphProgress(prev => {
            const updated = [...prev];
            updated[subgraphIdx] = { ...updated[subgraphIdx], status: 'Skipped' };
            return updated;
          });
          return;
        }

        let skip = 0;
        let chunk = 0;
        let accumulatedData: any[] = [];
        let zipIndex = 0;
        let currentZip = new JSZip();
        let subgraphRecordsFetched = 0;
        let subgraphStartTime = Date.now();

        while (true) {
          const res = await fetch('/api/fetch-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              subgraphId: subgraph.id, 
              apiKey, 
              query, 
              skip 
            }),
          });

          const data = await res.json();
          const entityData: Record<string, unknown[]> = data?.data;
          
          if (
            !res.ok ||
            !entityData ||
            Object.values(entityData).every(
              (arr) => !Array.isArray(arr) || arr.length === 0
            )
          ) {
            appendLog(`No more data for subgraph ${subgraph.id}. Stopping.`);
            break;
          }
        
          const values = Object.values(entityData);
          const currentBatch = values[0];
          accumulatedData = accumulatedData.concat(currentBatch);
          subgraphRecordsFetched += currentBatch.length;
          totalRecordsFetched += currentBatch.length;

          // Per-subgraph progress calculation
          let percentage = 0;
          let estimatedTime = 'Calculating...';
          if (skip >= 3000 && currentBatch.length === 1000) {
            const estimatedTotalSkips = skip * 2;
            percentage = Math.min((skip / estimatedTotalSkips) * 100, 95);
          } else if (skip >= 1000 && currentBatch.length === 1000) {
            const estimatedTotalSkips = skip + 500;
            percentage = Math.min((skip / estimatedTotalSkips) * 100, 90);
          } else if (skip === 0) {
            percentage = 5;
          } else {
            percentage = Math.min((skip / 10000) * 100, 80);
          }
          const elapsedTime = (Date.now() - subgraphStartTime) / 1000;
          if (elapsedTime > 0 && skip > 0) {
            const skipsPerSecond = skip / elapsedTime;
            const remainingSkips = skip * 0.5;
            const remainingSeconds = remainingSkips / skipsPerSecond;
            if (remainingSeconds < 60) {
              estimatedTime = `${Math.round(remainingSeconds)}s remaining`;
            } else if (remainingSeconds < 3600) {
              estimatedTime = `${Math.round(remainingSeconds / 60)}m remaining`;
            } else {
              estimatedTime = `${Math.round(remainingSeconds / 3600)}h remaining`;
            }
          }
          setSubgraphProgress(prev => {
            const updated = [...prev];
            updated[subgraphIdx] = {
              ...updated[subgraphIdx],
              percentage: Math.round(percentage),
              recordsFetched: subgraphRecordsFetched,
              estimatedTime,
              status: 'Downloading'
            };
            return updated;
          });

          // Add chunk to zip
          if (accumulatedData.length > 0 && (skip / 1000) % downloadFrequency === 0 && skip > 0) {
            currentZip.file(`chunk_${chunk}.json`, JSON.stringify({ data: accumulatedData }, null, 2));
            accumulatedData = [];
            chunk += 1;
          }

          // Check zip size after each batch
          const zipBlob = await currentZip.generateAsync({ type: 'blob' });
          if (zipBlob.size >= 250 * 1024 * 1024) { // 250 MB
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            const zipPartName = subgraph.fileName.replace(/\.zip$/, '') + `${zipIndex}.zip`;
            a.href = url;
            a.download = zipPartName;
            a.click();
            URL.revokeObjectURL(url);
            appendLog(`Downloaded zip file for ${subgraph.id}: ${zipPartName} (size: ${(zipBlob.size / (1024*1024)).toFixed(2)} MB)`);
            // Reset for next zip
            zipIndex++;
            currentZip = new JSZip();
          }

          if (currentBatch.length < 1000) {
            appendLog(`Final batch received with ${currentBatch.length} entries for subgraph ${subgraph.id}`);
            if (accumulatedData.length > 0) {
              currentZip.file(`chunk_${chunk}.json`, JSON.stringify({ data: accumulatedData }, null, 2));
            }
            break;
          }

          skip += 1000;
        }

        // Download final zip for this subgraph
        if (Object.keys(currentZip.files).length > 0) {
          const zipBlob = await currentZip.generateAsync({ type: 'blob' });
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement('a');
          const zipPartName = subgraph.fileName.replace(/\.zip$/, '') + `_part${zipIndex}.zip`;
          a.href = url;
          a.download = zipPartName;
          a.click();
          URL.revokeObjectURL(url);
          appendLog(`Downloaded zip file for ${subgraph.id}: ${zipPartName} (size: ${(zipBlob.size / (1024*1024)).toFixed(2)} MB)`);
        }
        setSubgraphProgress(prev => {
          const updated = [...prev];
          updated[subgraphIdx] = {
            ...updated[subgraphIdx],
            percentage: 100,
            estimatedTime: 'Complete!',
            status: 'Completed'
          };
          return updated;
        });
        appendLog(`Completed subgraph ${subgraph.id} (${subgraphRecordsFetched} records)`);
      }));

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

      {/* Multiple Subgraphs Section */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-700">Subgraphs:</label>
        {subgraphs.map((subgraph, index) => (
          <div key={index} className="flex space-x-2">
            <input
              type="text"
              placeholder="Enter Subgraph ID"
              value={subgraph.id}
              onChange={(e) => updateSubgraph(index, 'id', e.target.value)}
              className="flex-1 p-2 border rounded"
            />
            <input
              type="text"
              placeholder="Enter file name"
              value={subgraph.fileName}
              onChange={(e) => updateSubgraph(index, 'fileName', e.target.value)}
              className="flex-1 p-2 border rounded"
            />
            {subgraphs.length > 1 && (
              <button
                onClick={() => removeSubgraph(index)}
                className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addSubgraph}
          className="w-full py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Add More Subgraph
        </button>
      </div>

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
       https://gateway.thegraph.com/api/{apiKey || '[api-key]'}
    </span>
  </div>
      <button
        onClick={handleDownload}
        className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded hover:bg-blue-700"
        disabled={loading}
      >
        {loading ? 'Downloading...' : 'Start Download'}
      </button>

      {subgraphProgress.map((prog, idx) => (
        <div key={idx} className="mt-6 mb-6 p-4 bg-gray-50 border border-gray-300 rounded-lg shadow-sm flex flex-col space-y-2">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 space-y-1 sm:space-y-0">
            <span className="text-sm font-semibold text-gray-800">
              Subgraph: <span className="text-blue-700">{subgraphs[idx]?.id || 'N/A'}</span>
            </span>
            <span className="text-xs text-gray-600">
              File: <span className="font-mono text-gray-700">{subgraphs[idx]?.fileName || 'N/A'}</span>
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="relative w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-blue-500 h-4 rounded-full transition-all duration-300"
                style={{ width: `${prog.percentage}%` }}
              ></div>
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-bold text-gray-900">
                {prog.percentage}%
              </span>
            </div>
            <span className="text-xs text-gray-700 w-24 text-right">
              {prog.status}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mt-1 space-y-1 sm:space-y-0">
            <span className="text-xs text-gray-600">
              Records fetched: <span className="font-mono">{prog.recordsFetched.toLocaleString()}</span>
            </span>
            <span className="text-xs text-gray-500">
              {prog.estimatedTime}
            </span>
          </div>
        </div>
      ))}

      <div className="mt-6 bg-gray-100 p-3 rounded text-sm h-64">
       
        {log.map((entry, i) => (
          <div key={i}>{entry}</div>
        ))}
      </div>
    </div>
    </div>
  );
}
