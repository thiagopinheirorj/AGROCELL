# Instalador: Agrocel Certificados no servidor da empresa

O app funciona de dois jeitos, com o mesmo código:

| | **Nuvem** (padrão) | **Servidor da empresa** (esta pasta) |
|---|---|---|
| Onde ficam os dados | Supabase, São Paulo | Um computador da empresa (Windows ou Linux) |
| Acesso | De qualquer lugar, pela internet | Na rede da empresa (ou pela internet, se a empresa liberar) |
| Custo | Plano do Supabase | Nenhum serviço mensal; só o computador ligado |
| Backup | Supabase + "Backup completo" no app | Diário, automático, em `backups/` (e numa pasta de nuvem, se quiser) |
| Sem internet no celular | Visitas ficam na fila e sobem depois | Igual (ver observação sobre HTTPS abaixo) |
| Quem instala | Ninguém: já está no ar | Rode `instalar.ps1` (Windows) ou `instalar.sh` (Linux) |

O app descobre sozinho onde gravar: se existir `config.js` com a URL do servidor próprio, usa ele; se não, usa a nuvem. A tela de entrada mostra "Os dados deste sistema ficam …".

## Instalar no Windows

1. Instale o **Docker Desktop** (docker.com) e deixe aberto.
2. Copie a pasta inteira do app (com `index.html`, `supabase/` e esta pasta `instalador/`) para o servidor, por exemplo `C:\Agrocel`.
3. Abra o PowerShell nessa pasta `instalador` e rode:

```powershell
Set-ExecutionPolicy -Scope Process Bypass; .\instalar.ps1 -Endereco 192.168.0.10
```

Troque `192.168.0.10` pelo IP fixo do servidor na rede (use `localhost` se for só este computador). A primeira vez baixa cerca de 1,5 GB.

4. Abra `http://192.168.0.10:8080` (ou `http://localhost:8080`), clique em **Primeiro acesso do sistema** e crie o administrador.
5. Nos celulares, abra o mesmo endereço e "Adicionar à tela inicial".

O instalador cria um atalho na área de trabalho e agenda o backup diário às 22:00.

## Instalar no Linux

```bash
chmod +x instalar.sh backup.sh
./instalar.sh 192.168.0.10
```

## Atualizar o app

Baixe a versão nova (pasta inteira), sobrescreva os arquivos e rode o instalador de novo. Dados, senhas e chaves são mantidos; as migrações de banco (`supabase/migracao-*.sql`) são aplicadas sozinhas.

## Backup e nuvem

- `backup.ps1` / `backup.sh` grava em `backups/`: o banco (`.dump`), os arquivos (fotos e PDFs) e uma cópia de `.env`. Guarda 30 dias.
- Para ter cópia **também na nuvem**, aponte para uma pasta que sincroniza sozinha (OneDrive, Google Drive): `.\backup.ps1 -Nuvem "C:\Users\fulano\OneDrive\Agrocel backups"`. Para deixar isso no agendamento, edite a tarefa "Agrocel backup" no Agendador de Tarefas e acrescente `-Nuvem "..."`.
- Além disso, o administrador pode gerar o **Backup completo (.json)** dentro do app a qualquer hora.
- **Restaurar:** `docker compose exec -T db pg_restore -U postgres -d postgres --clean --if-exists < backups\agrocel-AAAA-MM-DD.dump` e descompacte o zip dos arquivos em `dados\storage`.

## O que fica onde

| Pasta/arquivo | O que é |
|---|---|
| `.env` | Senha do banco e chaves. **Guarde uma cópia fora do servidor.** Sem ele os dados não abrem. |
| `dados/db` | Banco de dados |
| `dados/storage` | Fotos e PDFs |
| `backups/` | Backups diários |
| `app/` | Cópia do app servida aos navegadores (gerada) |
| `kong.yml`, `functions/usuarios/` | Gerados a partir de `kong.template.yml` e de `supabase/functions/` |

## Comandos úteis (na pasta `instalador`)

```
docker compose stop        # para tudo (dados ficam)
docker compose start       # volta
docker compose logs -f     # ver os registros
docker compose down        # remove os contêineres (dados ficam em dados/)
```

## Segurança

- Ninguém cria conta sozinho (`GOTRUE_DISABLE_SIGNUP=true`); só o administrador cadastra usuários.
- As mesmas regras de acesso por linha (RLS) da nuvem valem aqui: o esquema é o mesmo `supabase/schema.sql`.
- Só a porta do app (8080) fica aberta; banco, login e arquivos só são alcançados por dentro do Docker.
- **HTTPS:** na rede interna o app roda em `http://`. Funciona, mas o navegador não guarda a cópia offline do app fora de `localhost` (a fila de visitas sem internet continua funcionando). Para acesso pela internet ou HTTPS, coloque um proxy com certificado (Caddy ou Nginx com Let's Encrypt) na frente da porta 8080 e rode o instalador com `-Endereco seu.dominio.com.br -Porta 443`.
- Mantenha o Windows/Linux e o Docker atualizados, e o computador com senha e disco criptografado (BitLocker).
