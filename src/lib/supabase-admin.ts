import { createClient } from '@supabase/supabase-js'
import { optionsMesure } from './mesureLectures'

// `optionsMesure()` est vide hors mesure locale (APP 70) : le client est alors
// créé exactement comme avant.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  optionsMesure(),
)
