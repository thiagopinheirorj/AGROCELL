# Agrocel Certificados

Sistema de gestão de certificados de controle de pragas da **Agrocel – Soluções no campo e na cidade** (Rio Fortuna/SC).

O app acompanha a validade de cada certificado emitido (desinsetização, desratização, higienização de reservatórios), avisa antes do vencimento e dá a cada cliente acesso aos próprios laudos.

![Painel administrativo](docs/painel.png)

![Registro de visita com assinatura do cliente](docs/registrar-visita.png)

> **Demonstração com dados fictícios.** Os clientes, CNPJs e PDFs deste repositório são exemplos e não representam clientes reais.

## Funcionalidades

**Painel administrativo**
- Índice de conformidade com a porcentagem de certificados em dia
- Contadores de vencidos, que vencem em 30 dias e em dia, que também funcionam como filtros
- Lista de clientes com busca por nome ou CNPJ; clientes com pendência aparecem em vermelho no topo
- Linha do tempo com os próximos vencimentos
- Controle dos documentos da própria empresa (ART, alvarás)

**Cores de status**

| Status | Regra |
|---|---|
| 🔴 Vencido | data de validade já passou |
| 🟡 Vence em breve | vence nos próximos 30 dias |
| 🟢 Em dia | vence em mais de 30 dias |

**Cadastro de certificados**
- Validade sugerida pelo tipo de serviço: desinsetização 12 meses, desratização 3 meses, higienização de reservatório 6 meses
- Anexo do PDF assinado

**Registro de visita técnica (ordem de serviço)**
- O técnico registra no local: cliente, data e hora, serviço, praga-alvo, produtos e áreas tratadas
- Cada visita gera uma ordem de serviço numerada (OS-2026-0001, OS-2026-0002…)
- Orientações pós-aplicação e termo de compromisso exibidos ao cliente
- Opção de gerar o certificado com a validade já calculada

**Assinatura do cliente na tela**
- Substitui o termo de compromisso em papel
- O responsável assina com o dedo no celular ou tablet do técnico, ou confirma depois na própria área do cliente
- O comprovante registra nome, data, hora e um código de verificação

**Avisos por e-mail**
- Dois avisos por certificado: 30 e 15 dias antes do vencimento
- Enviados ao responsável técnico e ao cliente

**Área do cliente**
- Cada cliente vê apenas os próprios certificados, com status e data de validade
- Download dos PDFs assinados

## Como rodar

É uma página estática, sem instalação. Abra o `index.html` no navegador ou publique pelo GitHub Pages (*Settings → Pages → Deploy from branch → main / root*).

## Estrutura

```
index.html                 app completo (HTML, CSS e JavaScript)
assets/logo-agrocel.png    logomarca
assets/exemplos/           certificados de exemplo em PDF
docs/painel.png            captura de tela
```

## Próximos passos

- [ ] Login real para administradores e clientes
- [ ] Banco de dados no servidor da Agrocel
- [ ] Envio automático dos e-mails de aviso
- [ ] Avisos por WhatsApp
- [ ] Geração do certificado e da ordem de serviço em PDF direto pelo app
- [ ] Versão para várias empresas de controle de pragas

## Autor

Desenvolvido por **Thiago Pinho Pinheiro** para a Agrocel.
