import { createClient } from '@supabase/supabase-js';

// 1. Get the keys with empty strings as fallbacks to prevent a crash
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// 2. Initialize the client (it won't crash even if strings are empty)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 3. Optional: A simple check you can call inside your components
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);