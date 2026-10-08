import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

// @ts-ignore - Fallback to process.env for Node/Playwright environments
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
// @ts-ignore
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables in .env');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);