// Dados públicos do projeto Supabase.
// IMPORTANTE: use somente a PUBLISHABLE/ANON KEY. Nunca coloque service_role aqui.
export const SUPABASE_URL = "https://vvdrhzupgwveajmhssll.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_kek4KjnDTgfBsI8WGVMLZg_9b6CJt0f";

// O ERP importa este arquivo diretamente.
if (typeof window !== 'undefined') {
  window.__PACO_SUPABASE = { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
  // Operação rápida -> foco visual -> fluxo de venda/financeiro.
  queueMicrotask(async () => {
    try {
      await import('./quick-ops.js');
      await import('./focus-v6.js');
      await import('./sale-flow-v6.js');
    } catch (error) {
      console.error('Erro ao carregar camadas operacionais:', error);
    }
  });
}
