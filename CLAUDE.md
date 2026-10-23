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

### Dois ambientes (real e teste)
- **Real**: projeto Supabase `agrocell` (`xchohhtxzsgfkmnyddjh`), sem dados de demonstração. É o que abre em `.../AGROCELL/`.
- **Teste (sandbox)**: projeto `agrocell-teste` (`fnwtbezcalgnihuckolc`), com dados fictícios. Abre com `?teste` no final do endereço (`.../AGROCELL/?teste`) e mostra a faixa "AMBIENTE DE TESTE". O código é o mesmo; só muda a URL/chave escolhida em `AMBIENTES` no `index.html`. Nada do teste vai para o real.
- Acessos de teste: `admin@agrocel.teste`, `tecnico@agrocel.teste` e `cliente@agrocel.teste` (empresa Vale Verde). A senha é a informada ao rodar o seed.
- Para **restaurar o teste ao estado inicial** (datas relativas a hoje): `node supabase/seed-teste.mjs <senha>`. O script só mexe no projeto de teste.
- Fluxo de trabalho: criar/alterar a funcionalidade, testar com `?teste`, e só então usar no real. Mudanças de banco: aplicar primeiro no projeto de teste e depois no real; o SQL de referência fica em `supabase/schema.sql` e a função em `supabase/functions/usuarios/index.ts` (idênticos nos dois projetos).

### Registro de atividade e exclusão (LGPD)
- Tabela `auditoria` (só o admin lê; ninguém altera nem apaga, nem o admin): gravada por triggers em `registros` e `perfis` (criou/alterou/excluiu/assinou/desativou), pela função `usuarios` (criar, redefinir senha, excluir usuário) e pelo `registrar_acesso()` chamado no login. Guarda só nomes de campos alterados, nunca valores, e-mails ou senhas.
- Aba **Registros** (admin) lista, filtra e baixa tudo em `registros.txt`.
- **Exclusão definitiva** (só admin; técnico só exclui fotos): cliente (apaga também certificados, OS, fotos, cobranças, PDFs e acessos do cliente, com confirmação digitando EXCLUIR), certificado (e PDF), ordem de serviço (e fotos), cobrança, foto e usuário (não exclui a si mesmo nem o único admin). Os arquivos do storage são apagados junto.
- Mudanças de banco sempre no projeto de teste primeiro, depois no real, e atualizar `supabase/schema.sql`.

### Visita sem internet (offline)
- **Bibliotecas locais** em `assets/vendor` (supabase-js 2.45.4, jsPDF 2.5.1, SheetJS 0.18.5), sem CDN. Ao trocar um arquivo, aumentar `VERSAO` em `sw.js`.
- **`sw.js`**: guarda o app no aparelho (página: rede primeiro, cópia se offline; demais arquivos: cópia primeiro). Nunca intercepta o Supabase.
- **IndexedDB `agrocel-offline-<ambiente>`**: `meta` (perfil e lista de clientes, só staff, apagados em `sair()`) e `saida` (fila de visitas, com fotos como arquivos e assinatura). A fila **sobrevive** ao sair da conta; `pedirSair()` avisa quando há itens.
- **Fluxo:** o submit da visita grava primeiro na fila (`OFF.salvarSaida`) e então chama `enviarItem()`. Se falhar, fica na fila e `enviarPendentes()` tenta de novo (evento `online`, a cada 60 s e botão). `enviarItem` é idempotente (ids fixos, foto com `path` já enviada não sobe de novo, visita já existente não duplica). O número da OS (`proxOS()`) é definido no envio.
- **Botões do formulário:** **Gerar OS** (grava na fila, envia e abre a OS com as fotos e o aviso "na sequência será gerado o documento oficial"; sem internet abre a prévia `previaOS`) e **Salvar para enviar depois** (grava na fila com `retido: true`; o envio automático ignora esses itens, só o botão **Enviar agora** em Pendentes os envia; a assinatura não é obrigatória).
- **Modo offline** (`OFFLINE`): `entrarOffline()` usa a cópia do aparelho; só as abas Registrar visita e Pendentes; `save()` fica bloqueado. `reconectar()` volta ao normal quando a internet volta.
- O cliente do Supabase usa `global.fetch` com resolução tardia para dar para simular queda de rede nos testes. Teste de ponta a ponta: `supabase/teste-offline.mjs`.

### Política de privacidade e termo de uso
- Texto-base em `TEXTO_PRIVACIDADE` e `TEXTO_TERMO` (`index.html`), aberto por `abrirPolitica()`: links na tela de login (`data-politica`) e botão **Privacidade** no cabeçalho. Versão e data em `POLITICA_VERSAO`/`POLITICA_DATA`; contato em `CONTATO_PRIVACIDADE`. **Ao mudar o texto, subir a versão e a data.**
- Pendências: revisão jurídica, confirmar com o Fernando o e-mail de contato (hoje `agrocelrf@hotmail.com`) e o prazo de guarda, e o texto da seção 5 do termo (simulações) quando boleto, Pix e NFS-e forem reais.

### Backup e restauração (admin)
- Exportar dados > **Backup completo (.json)** grava `{formato:"agrocel-backup-v1", ambiente, exportadoEm, clientes, certs, visitas, cobrancas, docs, proprios, fotos}`. **Não inclui** fotos/PDFs (arquivos do storage), logins nem o registro de atividade.
- Exportar dados > **Restaurar backup…**: `validarBackup` aceita só campos conhecidos com formato conferido (esquema `ESQ`; descarta o resto, evita HTML/XSS vindo do arquivo), mostra o resumo, e deixa **mesclar** (padrão, não apaga) ou **substituir tudo** (exige digitar CONFIRMAR; também exigido se o backup for de outro ambiente). Itens sem cliente existente são ignorados. A restauração é gravada pelo `save()` (diff em lotes) e registrada com `registrar_evento` (só admin).
- Para guardar também os arquivos, seria preciso um backup do storage (não existe ainda).

### Rotina de verificação de segurança
Checklist completo (semanal, mensal, trimestral, antes de mudanças e gatilhos) em `docs/rotina-de-seguranca.pdf`. Quando o usuário pedir "rode a verificação de segurança", faça nesta ordem:
1. `node supabase/testes-de-acesso.mjs <senha-de-teste>` (ou variável `AGROCEL_SENHA_TESTE`): restaura os dados do teste e roda 44 testes de acesso por perfil. Todos devem passar.
2. Rodar `supabase/verificar-projetos.sql` com `execute_sql` nos dois projetos (real `xchohhtxzsgfkmnyddjh` e teste `fnwtbezcalgnihuckolc`) e comparar `policies`, `functions`, `triggers`, `rls` e `bucket`. Comparar também o `ezbr_sha256` de `list_edge_functions` dos dois. Diferença = projetos fora de sincronia.
3. `get_advisors` (tipo security) nos dois projetos. Conhecidos e aceitos: `assinar_visita` e `registrar_acesso` executáveis por logados (de propósito, conferem o perfil por dentro).
4. No real: administradores ativos (ideal ≥ 2), usuários que nunca entraram, últimas linhas do registro de atividade (exclusões e acessos estranhos).
5. Salvar o relatório em texto em `C:\Users\thiag\Documents\Claude\Agrocell\Relatórios de segurança\AAAA-MM-DD.txt` (fora do repositório público, de propósito) e resumir ao usuário. Primeiro relatório: 2026-10-21.
Pendências abertas na 1ª verificação: segundo administrador, proteção contra senhas vazadas (painel do Supabase), backup/restauração, SRI nas bibliotecas por CDN. Verificação automática agendada: o usuário preferiu não agendar (decisão de 21/10/2026).

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
