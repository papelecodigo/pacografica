export const SELLERS=['IGOR','JHONATAN','BEATRIZ'];
export const QUOTE_STATUS={draft:'Rascunho',sent:'Enviado',waiting:'Aguardando cliente',negotiation:'Negociação',approved:'Aprovado',lost:'Perdido',expired:'Expirado'};
export const ORDER_STATUS={approved:'Aprovado',art:'Arte',waiting_approval:'Aguardando aprovação',print_queue:'Fila de impressão',printing:'Imprimindo',finishing:'Acabamento',cutting:'Corte',assembly:'Montagem',quality:'Conferência',ready:'Pronto',delivered:'Entregue',cancelled:'Cancelado'};
export const ORDER_STAGES=['approved','art','waiting_approval','print_queue','printing','finishing','cutting','assembly','quality','ready','delivered'];
export const CRM_STAGES=[['novo','Novo'],['orcamento','Orçamento'],['aguardando','Aguardando'],['aprovado','Aprovado'],['producao','Produção'],['pronto','Pronto'],['entregue','Entregue']];
export const TASK_PRIORITY={low:'Baixa',normal:'Normal',high:'Alta',critical:'Crítica'};

export const CATALOG_PRODUCTS=[
['Adesivos e Rótulos','Adesivo com corte personalizado'],['Adesivos e Rótulos','Kit adesivo escolar'],['Adesivos e Rótulos','Adesivo redondo'],['Adesivos e Rótulos','Adesivo quadrado ou retangular'],['Adesivos e Rótulos','Adesivo transparente'],['Adesivos e Rótulos','Rótulo para alimentos'],['Adesivos e Rótulos','Rótulo para bebidas'],['Adesivos e Rótulos','Etiqueta para embalagem'],['Adesivos e Rótulos','Lacre adesivo'],['Adesivos e Rótulos','Adesivo de recorte para vitrine'],['Adesivos e Rótulos','Adesivo impresso para vitrine'],['Adesivos e Rótulos','Adesivo para veículo'],
['Cartões e Papelaria','Cartão de visita'],['Cartões e Papelaria','Cartão fidelidade'],['Cartões e Papelaria','Tags personalizadas'],['Cartões e Papelaria','Papel timbrado'],['Cartões e Papelaria','Envelopes personalizados'],['Cartões e Papelaria','Bloco de pedido'],['Cartões e Papelaria','Receituários'],['Cartões e Papelaria','Comandas'],['Cartões e Papelaria','Impressões fotográficas'],['Cartões e Papelaria','Impressões A3, A4 e outros'],['Cartões e Papelaria','Topo de bolo'],
['Divulgação','Panfletos'],['Divulgação','Flyers'],['Divulgação','Folders'],
['Embalagens','Caixas personalizadas'],['Embalagens','Caixas personalizadas para delivery'],['Embalagens','Caixas para doces'],['Embalagens','Caixas para cookies'],['Embalagens','Caixas para alimentos'],['Embalagens','Caixas para cosméticos'],['Embalagens','Caixas para semijoias'],['Embalagens','Caixas kraft'],['Embalagens','Embalagens artesanais personalizadas'],['Embalagens','Cintas e elementos personalizados para embalagens'],
['Empresas e Comércios','Fachada de lona'],['Empresas e Comércios','Painel luminoso'],['Empresas e Comércios','Materiais diversos de identificação'],['Empresas e Comércios','Papelaria empresarial'],['Empresas e Comércios','Materiais para ponto de venda'],
['Design','Criação de artes'],['Design','Aplicação de identidade visual completa'],['Design','Desenvolvimento de materiais gráficos'],['Design','Desenvolvimento de embalagens e rótulos'],
['Sites e Soluções Digitais','Criação de websites'],['Sites e Soluções Digitais','Catálogos digitais'],['Sites e Soluções Digitais','Apresentações digitais'],['Sites e Soluções Digitais','Materiais para redes sociais'],['Sites e Soluções Digitais','Impresso + digital']
].map(([category,name])=>({category,name,subproduct:null,unit:'un',sale_price:0,direct_cost:0,minimum_margin:50,custom_fields:[],addons:[],recipe:[],pricing_rule:{type:'fixed'},workflow:defaultWorkflow(category,name),active:true}));

function defaultWorkflow(category,name){
  if(category==='Design'||category==='Sites e Soluções Digitais')return['Briefing','Produção','Revisão','Aprovação','Entrega'];
  if(name.toLowerCase().includes('adesivo')||name.toLowerCase().includes('rótulo'))return['Arte','Aprovação','Impressão','Corte','Conferência','Entrega'];
  if(category==='Embalagens')return['Arte','Aprovação','Impressão','Corte','Montagem','Conferência','Entrega'];
  if(category==='Empresas e Comércios')return['Medição','Arte','Aprovação','Produção','Instalação','Conferência'];
  return['Arte','Aprovação','Impressão','Acabamento','Conferência','Entrega'];
}

export const DEFAULT_AUTOMATIONS=[
{name:'Follow-up 24h após orçamento',trigger_event:'quote_sent',condition_json:{status:'sent'},action_type:'create_task',action_json:{title:'Fazer follow-up do orçamento',priority:'normal'},delay_minutes:1440,active:true},
{name:'Reforço após 3 dias sem resposta',trigger_event:'quote_waiting',condition_json:{status:'waiting'},action_type:'create_task',action_json:{title:'Retomar orçamento sem resposta',priority:'high'},delay_minutes:4320,active:true},
{name:'Pedido aprovado → iniciar produção',trigger_event:'quote_approved',condition_json:{},action_type:'create_task',action_json:{title:'Preparar pedido aprovado',priority:'high'},delay_minutes:0,active:true},
{name:'Aviso de vencimento',trigger_event:'receivable_due',condition_json:{days_before:1},action_type:'create_task',action_json:{title:'Revisar cobrança com vencimento amanhã',priority:'high'},delay_minutes:0,active:true},
{name:'Pedido pronto → avisar cliente',trigger_event:'order_ready',condition_json:{status:'ready'},action_type:'create_task',action_json:{title:'Avisar cliente que o pedido está pronto',priority:'normal'},delay_minutes:0,active:true},
{name:'Estoque abaixo do mínimo',trigger_event:'low_stock',condition_json:{below_minimum:true},action_type:'purchase_suggestion',action_json:{title:'Gerar sugestão de reposição'},delay_minutes:0,active:true},
{name:'Tarefa atrasada → prioridade crítica',trigger_event:'task_overdue',condition_json:{status:'todo'},action_type:'escalate_task',action_json:{priority:'critical'},delay_minutes:0,active:true},
{name:'Pós-venda em 7 dias',trigger_event:'order_delivered',condition_json:{status:'delivered'},action_type:'create_task',action_json:{title:'Fazer pós-venda e pedir feedback',priority:'normal'},delay_minutes:10080,active:true}
];
