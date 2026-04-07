import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zzenxkleifruvencdghu.supabase.co';
const supabaseAnonKey = 'sb_publishable_yYM5mkRPBG_uRNYiVwUyfQ_mlbePCWF';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);