// Dados públicos do projeto Supabase.
// IMPORTANTE: use somente a PUBLISHABLE/ANON KEY. Nunca coloque service_role aqui.
export const SUPABASE_URL = "https://vvdrhzupgwveajmhssll.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_kek4KjnDTgfBsI8WGVMLZg_9b6CJt0f";

// O ERP importa este arquivo diretamente.
if (typeof window !== 'undefined') {
  window.__PACO_SUPABASE = { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
  // Operação rápida -> foco -> venda -> checklist -> central online -> equipe.
  queueMicrotask(async () => {
    try {
      await import('./quick-ops.js');
      await import('./focus-v6.js');
      await import('./sale-flow-v8.js?build=20260901-1100');
      await import('./sale-checklist-v10.js?build=20260901-1200');
      await import('./whatsapp-online-v10.js?build=20260901-1210');
      await import('./team-online-v10.js?build=20260901-1230');
    } catch (error) {
      console.error('Erro ao carregar camadas operacionais:', error);
    }
  });
}
