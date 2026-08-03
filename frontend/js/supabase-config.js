// ====== CONFIGURAÇÃO DO SUPABASE (Harmonia) ======
// Projeto dedicado do Harmonia — separado do LocarBem.
const SUPABASE_URL = "https://uinalmjnsdnjqzhraxtt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbmFsbWpuc2RuanF6aHJheHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NzU3OTEsImV4cCI6MjEwMTM1MTc5MX0.niAtNHvGhN9-mNktgtzDx1_hEaTXV2BS8lNKuJd2NyE";

const _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = _supabaseClient;
