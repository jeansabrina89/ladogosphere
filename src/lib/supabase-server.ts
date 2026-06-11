// Alias historique : implémentation unique dans src/utils/supabase/server.ts
// (même client SSR par cookies, mêmes options). Conservé pour ne pas casser
// les imports existants de createSupabaseServerClient.
export { createClient as createSupabaseServerClient } from '../utils/supabase/server'
