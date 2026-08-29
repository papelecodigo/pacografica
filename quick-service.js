if(!document.querySelector('link[data-mobile-css]')){
  const mobileCss=document.createElement('link');
  mobileCss.rel='stylesheet';
  mobileCss.href='./mobile.css';
  mobileCss.dataset.mobileCss='true';
  document.head.appendChild(mobileCss);
}

import('./sale-lite.js?build=20260828-2029').catch(err=>console.error('Falha ao carregar complemento de venda',err));
import('./finance-insights.js?build=20260828-2049').catch(err=>console.error('Falha ao carregar leitura financeira',err));
import('./dashboard-order.js?build=20260828-2108').catch(err=>console.error('Falha ao organizar dashboard',err));
import('./cash-visuals.js?build=20260828-2128').catch(err=>console.error('Falha ao carregar gráficos de caixa',err));
import('./executive-dashboard.js?build=20260828-2138').catch(err=>console.error('Falha ao carregar dashboard executivo',err));
