import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.trim() !== '' &&
  supabaseAnonKey.trim() !== '' &&
  !supabaseUrl.includes('your-project')
);

// Use a safe fallback so createClient does not crash the React app if env vars are missing
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-key',
  {
    global: {
      // Fixes the "Node.js detected but native WebSocket not found" warning in Vite
      fetch: (...args) => fetch(...args),
    },
    // The issue usually comes from realtime assuming Node.js if `process` is polyfilled somehow.
    realtime: {
      transport: typeof window !== 'undefined' ? window.WebSocket : undefined,
    }
  }
);