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
- **Um único `index.html`** (HTML/CSS/JS puro, sem framework). Login e dados no **Supabase** (projeto `agrocell`, id `xchohhtxzsgfkmnyddjh`, região São Paulo, organização "Beco da cultura").
- Bibliotecas por CDN: SheetJS `xlsx 0.18.5`, jsPDF `2.5.1` (cdnjs) e `@supabase/supabase-js 2.45.4` (jsDelivr).
- Visual: marca #004107, lima #8bc34a, laranja #e8762c; fontes Sora, Manrope, JetBrains Mono; tema claro/escuro por tokens CSS.
- Publicado em GitHub Pages: https://thiagopinheirorj.github.io/AGROCELL/ · repositório público: https://github.com/thiagopinheirorj/agrocell
- Para testar localmente: servidor estático na pasta (`npx http-server -p 8765`; Python não está instalado de verdade) e abrir `http://127.0.0.1:8765/index.html`.

### Login e perfis
Três perfis (tabela `perfis`, papel `admin` | `tecnico` | `cliente`):
- **admin**: tudo, inclusive cobranças, NFS-e, avisos, documentos da empresa e cadastro de usuários (aba "Usuários").
- **tecnico**: cadastra clientes, registra visitas/laudos, certificados, fotos e relatórios, e cria o acesso de clientes. Não vê cobranças, não exporta dados, não cria técnicos/admins.
- **cliente**: só vê certificados, OS, fotos, cobranças e documentos da própria empresa (`perfis.cliente_id`); assina OS pela função `assinar_visita`.

Como os dados funcionam:
- Tabela `registros(tipo, id, cli, data jsonb)` guarda clientes, certs, visitas, cobrancas, docs, proprios e fotos. O app mantém o objeto `db` em memória e `save()` envia só o que mudou (diff contra `snap`). **Quem protege os dados são as regras RLS no banco**, não o JavaScript.
- Fotos e PDFs: bucket privado `anexos`, caminho `{id_do_cliente}/arquivo`; o app abre por link temporário (`createSignedUrl`). Fotos têm limite de 10 MB e são reduzidas para 1600 px antes do envio.
- Cadastro de usuários e troca de senha de terceiros: Edge Function `usuarios` (usa a chave de serviço no servidor; ações `bootstrap`, `criar`, `redefinir_senha`). `bootstrap` cria o **primeiro admin** e só funciona enquanto não houver nenhum admin ("Primeiro acesso do sistema" na tela de login).
- A chave `SUPABASE_KEY` no `index.html` é a chave pública (anon); pode ficar no repositório. **Nunca** coloque a chave `service_role` aqui.
- Contas de usuário são criadas com senha provisória informada por admin/técnico (sem e-mail de convite; o envio de e-mails ainda não existe). O usuário troca a senha em "Minha conta".

## Regras importantes
1. **Este repositório é público: nunca coloque dados reais de clientes** (nomes, CNPJs, PDFs) nem senhas/chaves secretas no código. Os dados reais ficam só no banco (Supabase). O banco começa vazio; não há mais dados de demonstração no app.
2. Boleto, Pix e NFS-e são **simulação** e precisam estar rotulados assim na tela.
3. Antes de dispensar o papel, o Fernando deve confirmar com a **Vigilância Sanitária** que a assinatura eletrônica simples vale (Lei 14.063/2020); a alíquota de **ISS** deve ser confirmada com o contador.
4. Dinheiro sempre em real (R$), nunca em dólar.

## Próximos passos (em ordem de impacto)
1. ~~Login e banco de dados~~ (feito com Supabase). Agora: **e-mails automáticos de aviso** (30 e 15 dias) via Edge Function agendada + serviço de e-mail, e e-mail de convite/recuperação de senha. Depois, avaliar hospedagem no agroceloficial.com.br.
2. **Conta de cobrança** (banco ou plataforma como Asaas/Efí) para boleto e Pix reais, comparando a tarifa por boleto pago.
3. **NFS-e real** (prefeitura ou API de notas), após confirmar o ISS com o contador.
4. Avisos por WhatsApp.
5. Versão multiempresa (cada dedetizadora com login, logo e clientes próprios).

## Como trabalhar aqui
- Edite `index.html`; teste abrindo no navegador (Playwright/Chromium já está disponível no ambiente cloud).
- Ao mudar o app, atualize `README.md` e as capturas em `docs/` se a tela mudar.
- Commits em português, curtos e descritivos.
