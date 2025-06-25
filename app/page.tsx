'use client';
import {useState} from 'react'
export default function Home() {
  const [API_KEY, setAPI_KEY] = useState("");
  const [SUBGRAPH_ID, setSUBGRAPH_ID] = useState("");
  const [QUERY, setQUERY] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState("");

  const handleFetch = async () => {
    if (!API_KEY || !SUBGRAPH_ID || !QUERY) {
setMessage('Please fil All fields');
return;
    }
    setMessage('Fetching data...');
    const url=`https://gateway.thegraph.com/api/${API_KEY}/subgraphs/id/${SUBGRAPH_ID}`;
    try{
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: QUERY,
        }),
      });
      const data = await response.json();
      if(response.ok){
        console.log(data);
        setResult(JSON.stringify(data, null, 2));
        setMessage("Data fetched Successfully");
      }else{
        setMessage(data.errors[0].message);
      }
    }catch(error){
      console.log(error);
        setMessage('faied to fetch. Please Check console for more details...');
      }
    }
    
  return (
    <div className='min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 space-y-6'>
    <div className='w-full max-w-md space-y-4'>
      <input className='w-full p-2 border rounded'
      type='text'
      placeholder='Enter API Key'
      value={API_KEY}
      onChange={(e) => setAPI_KEY(e.target.value)}
      />
      <input className='w-full p-2 border rounded'
      type='text'
      placeholder='Enter Subgraph ID'
      value={SUBGRAPH_ID}
      onChange={(e) => setSUBGRAPH_ID(e.target.value)}
      />
      <textarea className='w-full p-3 font-mono text-sm bg-gray-900 text-green-200 border border-gray-700 rounded shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500'
        rows={8}
        placeholder='Enter Query'
        value={QUERY}
        onChange={(e) => setQUERY(e.target.value)}
></textarea>

  <div className='text-sm text-gray-500'>
    URL Preview:
    <br/>
    <span className="text-blue-600 font-mono">
       https://gateway.thegraph.com/api/{API_KEY || '[api-key]'}/subgraphs/id/{SUBGRAPH_ID || '[subgraph-id]'}
    </span>
  </div>
      <button onClick={handleFetch}
      className='w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded hover:bg-blue-700'>
        fetch Data
      </button>
      {message&& (<div className='text-center text-sm text-red-600 mt-2'>{message}</div>)}
      {result && (
        <div>
        <pre className='bg-black text-green-300 p-4 rounded overflow-auto max-h-96'>
          {result}
        </pre>
        <button
      onClick={() => {
        const blob = new Blob([result], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "result.json";
        a.click();
        URL.revokeObjectURL(url);
        setMessage("Download started");
      }}
      className="mt-3 bg-green-600 text-white font-semibold py-2 px-4 rounded hover:bg-green-700 text-sm"
    >
      Download JSON
    </button>
    </div>
      )}
    </div>
    </div>
  );
}
