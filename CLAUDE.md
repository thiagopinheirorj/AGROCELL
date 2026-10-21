# Agrocel Certificados — contexto do projeto

Leia este arquivo antes de qualquer tarefa. Responda ao usuário sempre em **português do Brasil**; valores em **R$**.

## Quem é quem
- **Thiago Pinho Pinheiro** — desenvolve o app (usuário que conversa com você).
- **Fernando Werner Felippe** — dono da **Agrocel** (controle de pragas, Rio Fortuna/SC), cliente do projeto. Site: agroceloficial.com.br (hospedagem ainda desconhecida). E-mail de avisos: agrocelrf@hotmail.com.
- Fernando também enxerga vender o sistema para outras dedetizadoras do Brasil.

## Objetivo do app
Controlar a validade dos certificados de controle de pragas e avisar por e-mail **30 e 15 dias antes** do vencimento (para Fernando e para o cliente).
- **Painel admin** (Thiago e Fernando): todos os clientes; vencido em vermelho.
- **Área do cliente**: cada cliente vê só os próprios certificados/laudos. Cores: vermelho = vencido, amarelo = vence em ≤30 dias, verde = em dia, sempre com a data.

## Funcionalidades já prontas (protótipo)
Painel com semáforo e filtros · cadastro de clientes (máscara e validação de CNPJ, CEP, telefone) · cadastro de certificados (validade sugerida: desinsetização 12 meses, desratização 3, reservatório 6) · registro de visita técnica com ordem de serviço (`OS-AAAA-NNNN`) · assinatura do cliente na tela (substitui o termo em papel; código de verificação) · cobranças com boleto/Pix **simulados** · NFS-e **simulada** (item 7.13 da LC 116/2003, ISS padrão 3%) · PDF de nota, cobrança e OS · exportação (Excel, CSV, JSON) · avisos por e-mail (só a tela, **não envia de verdade**) · troca Admin/Cliente.

## Arquitetura atual
- **Um único `index.html`** (HTML/CSS/JS puro, sem framework), dados em `localStorage`.
- Bibliotecas por CDN (cdnjs): SheetJS `xlsx 0.18.5`, jsPDF `2.5.1`.
- Visual: marca #004107, lima #8bc34a, laranja #e8762c; fontes Sora, Manrope, JetBrains Mono; tema claro/escuro por tokens CSS.
- Dados de demonstração **fictícios** (datas relativas via `rel(n)`, CNPJs válidos de exemplo).
- Publicado em GitHub Pages: https://thiagopinheirorj.github.io/AGROCELL/ · repositório público: https://github.com/thiagopinheirorj/agrocell

## Regras importantes
1. **Este repositório é público: nunca coloque dados reais de clientes** (nomes, CNPJs, PDFs). A versão com dados reais existe só como protótipo privado (artifact no claude.ai) e não faz parte deste repo.
2. Boleto, Pix e NFS-e são **simulação** e precisam estar rotulados assim na tela.
3. Antes de dispensar o papel, o Fernando deve confirmar com a **Vigilância Sanitária** que a assinatura eletrônica simples vale (Lei 14.063/2020); a alíquota de **ISS** deve ser confirmada com o contador.
4. Dinheiro sempre em real (R$), nunca em dólar.

## Próximos passos (em ordem de impacto)
1. **Hospedagem** no servidor do agroceloficial.com.br (ou outro), com **login de verdade** e **banco de dados** — destrava os e-mails automáticos.
2. **Conta de cobrança** (banco ou plataforma como Asaas/Efí) para boleto e Pix reais, comparando a tarifa por boleto pago.
3. **NFS-e real** (prefeitura ou API de notas), após confirmar o ISS com o contador.
4. Avisos por WhatsApp.
5. Versão multiempresa (cada dedetizadora com login, logo e clientes próprios).

## Como trabalhar aqui
- Edite `index.html`; teste abrindo no navegador (Playwright/Chromium já está disponível no ambiente cloud).
- Ao mudar o app, atualize `README.md` e as capturas em `docs/` se a tela mudar.
- Commits em português, curtos e descritivos.
