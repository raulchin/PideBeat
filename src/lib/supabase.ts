import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
export const configured = Boolean(url && key && !url.includes('TU_PROYECTO'))
export const supabase = createClient<Database>(
  configured ? url! : 'https://configuration-required.supabase.co',
  configured ? key! : 'configuration-required',
)
