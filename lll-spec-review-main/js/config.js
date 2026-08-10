// ============================================
// 朱入れ (Shuire) — configuration
// Fill these in from Supabase → Project Settings → API
// ============================================
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
