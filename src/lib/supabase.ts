import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

const runtime = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL ?? runtime.process?.env?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? runtime.process?.env?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables in .env');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
