# Papel e Código — evolução para ERP/CRM vertical de gráfica

## Objetivo

Evoluir o sistema atual sem descartar o que já funciona. O caixa, dashboard, serviços, funil, financeiro, investimentos e lançamentos tornam-se a base de um ERP/CRM específico para gráfica.

A arquitetura final será integrada: atendimento → orçamento → pedido → financeiro → produção → estoque → entrega → pós-venda.

## Mapeamento do sistema atual

| Hoje | Evolução |
| --- | --- |
| Visão geral | Dashboard / BI executivo |
| Nova venda | Pedido rápido / venda balcão |
| Serviços | Catálogo inteligente |
| Funil | CRM comercial |
| Financeiro | Caixa + contas a receber/pagar |
| Investimentos | Ativos e equipamentos |
| Lançamentos | Livro-caixa mensal |
| Configurações | Empresa, regras, metas e permissões |

## Novos módulos

1. Clientes
2. Orçamentos
3. Pedidos
4. Produção
5. Tarefas
6. Estoque e compras
7. Fornecedores
8. Contas a receber / pagar
9. Aprovação de arte
10. BI e alertas

## Fase 1 — ERP Core

### Clientes
Cadastro completo com nome/razão social, CPF/CNPJ, WhatsApp, e-mail, endereço, segmento, origem, vendedor e observações.

### Orçamentos
- cliente;
- produto/serviço;
- quantidade;
- atributos;
- custo;
- preço sugerido;
- desconto;
- margem;
- validade;
- versões;
- status.

Funil inicial:
- rascunho;
- enviado;
- aguardando cliente;
- negociação;
- aprovado;
- perdido.

### Pedidos
Quando um orçamento for aprovado, ele deve virar pedido sem redigitação.

O pedido congela:
- cliente;
- itens;
- preço negociado;
- custo estimado;
- prazo;
- responsável.

### Tarefas
Ligadas a pedido e cliente, com responsável, prazo, prioridade, status e tempo estimado.

### Estoque
Cadastro de insumos, estoque atual, estoque mínimo, custo médio, unidade e localização.

## Fase 2 — Produção

Kanban inicial:
- aguardando arte;
- arte em criação;
- aguardando aprovação;
- aprovado;
- fila de impressão;
- imprimindo;
- acabamento;
- corte;
- montagem;
- conferência;
- pronto;
- entregue.

Cada pedido deve permitir ordem de produção, responsáveis, prazos e tempos.

## Fase 3 — Financeiro completo

Separar:

### Caixa
Dinheiro realmente recebido e pago.

### Resultado econômico
O que foi vendido/produzido no período.

### Contas a receber
- pedido;
- cliente;
- vencimento;
- valor;
- recebido;
- pendente;
- vencido.

### Contas a pagar
- fornecedor;
- categoria;
- centro de custo;
- vencimento;
- recorrência;
- pagamento.

## Fase 4 — Catálogo inteligente

Arquitetura:

Categoria → Produto → Subproduto → Variação → Atributos → Adicionais → Receita de produção → Regra de preço.

Cada produto pode ter campos próprios e uma receita de produção (BOM), permitindo calcular custo de material, operação, mão de obra, perdas, impostos, comissão e terceirização.

## Regras importantes

### Margem
Preço mínimo = custo total / (1 - margem desejada)

O sistema deve alertar quando a margem ficar abaixo do mínimo definido.

### Produto personalizado
Toda venda/orçamento deve permitir item personalizado e opção de salvar como novo produto.

### Auditoria
Alterações relevantes devem registrar usuário, data, valor anterior e valor novo.

### Automação
Automatizar apenas ações seguras. Recomendações financeiras e descontos críticos exigem confirmação humana.

## Ordem de implementação recomendada

1. Clientes
2. Orçamentos
3. Pedidos
4. Contas a receber
5. Produção
6. Tarefas
7. Estoque
8. Compras/fornecedores
9. Catálogo flexível e BOM
10. Aprovação de arte
11. Automações
12. IA e BI avançado

## Princípio do projeto

O sistema não deve virar um conjunto de módulos isolados. A informação deve nascer uma vez e ser reaproveitada em todo o fluxo.
