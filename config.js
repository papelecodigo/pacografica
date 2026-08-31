// Dados públicos do projeto Supabase.
// IMPORTANTE: use somente a PUBLISHABLE/ANON KEY. Nunca coloque service_role aqui.
export const SUPABASE_URL = "https://vvdrhzupgwveajmhssll.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_kek4KjnDTgfBsI8WGVMLZg_9b6CJt0f";

// O ERP V5 importa este arquivo diretamente.
if (typeof window !== 'undefined') {
  window.__PACO_SUPABASE = { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
  // Camada de produtividade: + Criar, Hoje, tarefas rápidas, atalhos e Ctrl+K.
  queueMicrotask(() => import('./quick-ops.js').catch((error) => console.error('Erro ao carregar operação rápida:', error)));
}
