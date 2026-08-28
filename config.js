// Dados públicos do projeto Supabase.
// IMPORTANTE: use somente a PUBLISHABLE/ANON KEY. Nunca coloque service_role aqui.
export const SUPABASE_URL = "https://vvdrhzupgwveajmhssll.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_kek4KjnDTgfBsI8WGVMLZg_9b6CJt0f";

// Extensões do sistema carregadas sem alterar o núcleo do caixa.
if (typeof window !== 'undefined') {
  window.__PACO_SUPABASE = { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
  import('./movement-date.js').catch((error) => console.error('Erro ao carregar módulo de datas:', error));
}
