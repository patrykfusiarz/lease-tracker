import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:     true,   // keep session in localStorage across browser restarts
    autoRefreshToken:   true,   // silently refresh before expiry
    detectSessionInUrl: false,  // not using OAuth redirect flows
  },
})
