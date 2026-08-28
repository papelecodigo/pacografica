if(!document.querySelector('link[data-mobile-css]')){
  const mobileCss=document.createElement('link');
  mobileCss.rel='stylesheet';
  mobileCss.href='./mobile.css';
  mobileCss.dataset.mobileCss='true';
  document.head.appendChild(mobileCss);
}

import('./sale-lite.js?build=20260828-2029').catch(err=>console.error('Falha ao carregar complemento de venda',err));
import('./finance-v4.js?build=20260828-2046').catch(err=>console.error('Falha ao carregar complemento financeiro',err));
