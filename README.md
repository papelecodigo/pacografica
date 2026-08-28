# Caixa da Gráfica — Papel e Código

Sistema de caixa simples para GitHub Pages, usando Supabase para autenticação e banco de dados.

## Recursos da versão inicial
- Login por e-mail e senha
- Abertura de caixa
- Venda com múltiplos itens
- Desconto
- Pix, dinheiro, débito, crédito e outro
- Entradas e saídas de caixa
- Histórico por data
- Resumo diário
- Fechamento com conferência de dinheiro e diferença
- Layout responsivo para computador e celular

## 1. Criar o projeto no Supabase
1. Acesse o Supabase e crie um projeto.
2. Abra **SQL Editor** e execute todo o conteúdo de `supabase.sql`.
3. Em **Authentication > Users**, crie o usuário que utilizará o caixa.
4. Em **Project Settings > API**, copie:
   - Project URL
   - anon / publishable key
5. Abra `config.js` e substitua os dois valores.

> A chave anon/publishable pode ser usada no frontend quando Row Level Security (RLS) está configurado. NUNCA coloque a `service_role` no GitHub.

## 2. Publicar no GitHub Pages
1. No GitHub, abra **Settings > Pages**.
2. Em **Build and deployment**, selecione **Deploy from a branch**.
3. Escolha a branch `main` e pasta `/ (root)`.
4. Salve.

Endereço esperado:
`https://papelecodigo.github.io/pacografica/`

## Segurança
- As senhas não ficam no repositório; são gerenciadas pelo Supabase Auth.
- O banco usa RLS para isolar os dados de cada usuário.
- Nunca publique a `service_role key`.
- Para uso comercial real, mantenha HTTPS ativado no GitHub Pages e use senhas fortes.

## Observação
Esta é uma primeira versão operacional. Antes de usar como controle financeiro oficial, faça testes com vendas fictícias, abertura e fechamento de caixa.
