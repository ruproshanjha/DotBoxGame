import { createClient } from '@supabase/supabase-js';

// Fallback dummy strings to prevent build-time prerendering crashes when env vars are missing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (
  supabaseUrl === 'https://placeholder-url.supabase.co' ||
  supabaseAnonKey === 'placeholder-anon-key'
) {
  if (typeof window !== 'undefined') {
    console.warn(
      'Supabase credentials are not configured. Please define NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment.'
    );
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export default supabase;
