import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient';

export default function App() {
  const [status, setStatus] = useState<string>('Testing connection...');
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkConnection() {
      if (!isSupabaseConfigured) {
        setStatus('Missing Supabase credentials in .env.local');
        setIsConnected(false);
        return;
      }

      try {
        const startTime = performance.now();
        // Ping Supabase with a lightweight query
        const { error } = await supabase.from('_test_connection_').select('*').limit(1);
        const elapsed = Math.round(performance.now() - startTime);

        // Supabase error codes like PGRST205, 42P01, or schema cache messages mean
        // the request successfully reached the Supabase API and the database responded.
        const isConnectedResponse =
          !error ||
          error.code === 'PGRST205' ||
          error.code === '42P01' ||
          error.message?.includes('schema cache') ||
          error.message?.includes('relation') ||
          error.message?.includes('does not exist');

        if (isConnectedResponse) {
          setStatus(`Connected successfully to Supabase! (${elapsed}ms)`);
          setIsConnected(true);
        } else if (error?.message?.includes('Invalid API key') || error?.message?.includes('JWT')) {
          setStatus(`Authentication Error: Invalid API key in .env.local`);
          setIsConnected(false);
        } else {
          setStatus(`Supabase Response: ${error.message}`);
          setIsConnected(true);
        }
      } catch (err) {
        setStatus(`Connection failed: ${err instanceof Error ? err.message : 'Network error'}`);
        setIsConnected(false);
      }
    }

    checkConnection();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-800/90 border border-slate-700 rounded-2xl p-6 shadow-2xl text-center">
        <h1 className="text-2xl font-bold text-indigo-400 mb-2">Database Connection Test</h1>
        <p className="text-slate-400 text-sm mb-6">Supabase client status</p>

        <div
          className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
            isConnected === true
              ? 'bg-emerald-950/70 border-emerald-500 text-emerald-300'
              : isConnected === false
              ? 'bg-rose-950/70 border-rose-500 text-rose-300'
              : 'bg-slate-700/50 border-slate-600 text-slate-300'
          }`}
        >
          {status}
        </div>

        {!isSupabaseConfigured && (
          <div className="mt-6 text-left bg-slate-900/90 p-4 rounded-xl border border-slate-700 text-xs text-slate-300 space-y-2">
            <p className="font-semibold text-amber-400">⚡ Setup Steps:</p>
            <p>1. Open <code className="text-indigo-300 bg-slate-800 px-1 py-0.5 rounded">.env.local</code> in the root of your project.</p>
            <p>2. Add your Supabase credentials:</p>
            <pre className="p-2.5 bg-black/50 rounded-lg text-emerald-400 font-mono text-[11px] overflow-x-auto leading-relaxed">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
            </pre>
            <p>3. Restart the dev server (<code className="text-indigo-300 bg-slate-800 px-1 py-0.5 rounded">npm run dev</code>).</p>
          </div>
        )}
      </div>
    </div>
  );
}