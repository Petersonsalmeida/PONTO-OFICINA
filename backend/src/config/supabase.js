const { createClient } = require('@supabase/supabase-js');

let _supabase = null;

function getSupabase() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key || url.includes('SEU_PROJETO')) {
    console.warn('⚠️  Supabase não configurado — operando em modo local (SQLite only)');
    return null;
  }

  _supabase = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });

  return _supabase;
}

module.exports = { getSupabase };
