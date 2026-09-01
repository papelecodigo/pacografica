# Papel e Código — WhatsApp Local

Conector local para importar nome, número e última mensagem de conversas do WhatsApp para a **Venda rápida** do ERP, usando login por QR Code no WhatsApp Web.

## Como usar no Windows

1. Instale **Node.js 18 ou superior** se ainda não estiver instalado.
2. Baixe a pasta `whatsapp-local` para o computador da gráfica.
3. Dê dois cliques em `iniciar-whatsapp.bat`.
4. Na primeira execução, aguarde a instalação automática das dependências.
5. Deixe a janela aberta.
6. No ERP, abra **Vendas → WhatsApp**.
7. Escaneie o QR em **WhatsApp → Aparelhos conectados → Conectar aparelho**.
8. Escolha uma conversa e clique em **Usar cliente**.

A sessão fica armazenada localmente na pasta `.wwebjs_auth` criada pelo `whatsapp-web.js`. Não envie essa pasta para terceiros e não a coloque no GitHub.

## Privacidade

O serviço escuta somente em `127.0.0.1:3031` e aceita o site `https://papelecodigo.github.io`. O ERP lista apenas conversas individuais recentes e importa somente o contato escolhido pelo operador.

## Observação importante

Esta integração usa automação do WhatsApp Web, não a API oficial da Meta. Portanto pode exigir manutenção caso o WhatsApp altere o funcionamento interno do WhatsApp Web e não oferece a mesma estabilidade de uma integração oficial.
