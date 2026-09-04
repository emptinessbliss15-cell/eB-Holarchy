import { createEBlissAPI } from '../ebliss-api.js';

const SUPABASE_URL = 'https://zaabghrczrbqkxrhkinj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_QL6Bz9m30CV8HFIdkLQ42Q_N9AFIOkF';

export function createSupabaseBackend()
{
  if (!window.supabase)
  {
    throw new Error('Supabase client library is not loaded');
  }

  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  return createEBlissAPI(client);
}
