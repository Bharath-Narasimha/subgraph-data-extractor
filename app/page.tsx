'use client';

import { useState } from 'react';

export default function Home() {
  const [subgraphId, setSubgraphId] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [displayData,setDisplayData]=useState<string[]>([]);

  const appendLog = (msg: string) => setLog((prev) => [...prev, msg]);

  const handleDownload = async () => {
    setLoading(true);
    setLog([]);
    setDisplayData([]);

    let skip = 0;
    let chunk = 0;

    try {
      while (true) {
        appendLog(`Fetching skip=${skip}...`);

        const res = await fetch('/api/fetch-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subgraphId, apiKey, query, skip }),
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
          appendLog('No more data or all results empty. Stopping.');
          break;
        }
     const values=Object.values(entityData);
const currentBatch=values[0] as unknown;
if (Array.isArray(currentBatch)) {
  if (currentBatch.length < 1000) {
    appendLog(`Final batch received with ${currentBatch.length} entries`);
    setDisplayData(currentBatch);
    break;
  }
}
        const filename = `subgraph_chunk_${chunk}.json`;
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        appendLog(`Saved ${filename}`);

        skip += 1000;
        chunk += 1;
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
        {displayData.length > 0 && (
  <div className="mt-4">
    <h2 className="text-lg font-bold">Final Batch Data</h2>
    <pre className="bg-gray-100 p-4 rounded max-h-[400px] overflow-y-auto text-sm">
      {JSON.stringify(displayData, null, 2)}
    </pre>
  </div>
)}
      </div>
    </div>
    </div>
  );
}
