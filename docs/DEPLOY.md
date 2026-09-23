# Pôr o VRBAN online (só com o telemóvel)

Tudo se faz no navegador do telemóvel. O serviço de alojamento (Render) lê o código diretamente do GitHub; não é preciso computador nem terminal.

> Os planos, limites e preços do Render mudam. Confirme-os no site antes de criar os serviços. O `render.yaml` pede o plano gratuito, que tem limites: o serviço adormece após um período sem visitas (a primeira abertura seguinte demora cerca de um minuto) e a base de dados gratuita pode ter prazo de validade — para uso continuado, passe a base para um plano pago antes de o prazo terminar, ou perde os dados.

## O que o repositório já traz

- `Dockerfile` — imagem de produção (aplicação, fila de exportações e LibreOffice para PDF).
- `render.yaml` — cria automaticamente o serviço web e a base PostgreSQL.
- Arranque automático: aplica as migrações, cria a sua conta de autor na primeira vez, guarda os ficheiros exportados na base de dados (os discos gratuitos apagam-se a cada reinício) e corre a fila no mesmo processo.

## Passos

1. No telemóvel, abra **render.com** e toque em **Get Started** → **GitHub** (entre com a conta GitHub que tem o repositório `MONOGRAFIA-V1.1`). Autorize o Render a aceder a esse repositório.
2. No painel do Render: **New +** → **Blueprint**.
3. Escolha o repositório **DanDMF/MONOGRAFIA-V1.1** e o branch **`claude/vrban-centro-investigacao-i1gip3`** (é onde está o `render.yaml`, enquanto não for integrado no branch principal).
4. O Render mostra o serviço `vrban` e a base `vrban-db` e pede três valores:
   - `VRBAN_BOOTSTRAP_EMAIL` — o seu email de acesso;
   - `VRBAN_BOOTSTRAP_NAME` — o seu nome (ex.: Fábio Daniel Martins Ferreira);
   - `VRBAN_BOOTSTRAP_PASSWORD` — uma palavra-passe forte, com **12 ou mais caracteres** (guarde-a num local seguro).
5. Toque em **Apply** / **Create**. A primeira construção demora 10–20 minutos (instala o LibreOffice).
6. Quando o estado ficar **Live**, o Render mostra o endereço, por exemplo `https://vrban-xxxx.onrender.com`.
   - Área de investigação: `https://…onrender.com/entrar` (email e palavra-passe do passo 4).
   - Site público: `https://…onrender.com/` (mostra “Investigação em desenvolvimento” até publicar uma versão).
7. **Segurança:** depois de entrar pela primeira vez, no Render abra o serviço `vrban` → **Environment** e **apague `VRBAN_BOOTSTRAP_PASSWORD`**. A conta já existe; a variável deixa de ser necessária (se ficar, é ignorada, mas não deve ficar guardada).
8. Opcional: no navegador do telemóvel, menu → **Adicionar ao ecrã principal**, para abrir o VRBAN como uma app.

## Atualizações

Cada novo commit no branch escolhido é publicado automaticamente pelo Render (as migrações são aplicadas no arranque e nunca apagam dados).

## Se algo falhar

- **Build falhou:** no Render, serviço `vrban` → **Logs**; copie a mensagem de erro e envie-a.
- **Não consigo entrar:** confirme que o email coincide com `VRBAN_BOOTSTRAP_EMAIL`. Se a palavra-passe tinha menos de 12 caracteres, a conta não foi criada (os logs dizem “Provisionamento inicial recusado”); corrija a variável e reinicie (**Manual Deploy → Deploy latest commit**) — só funciona enquanto não existir nenhuma conta.
- **PDF falha por memória:** o plano gratuito tem memória limitada (nos testes, a conversão usou cerca de 340 MB). Exporte em Word (.docx) ou passe o serviço para um plano com mais memória.

## Backups

A base do Render tem cópias próprias nos planos pagos. Os ficheiros exportados estão na própria base (`stored_blob`). Uma cópia manual exige `pg_dump` (ver README) — até existir o módulo de backups da aplicação (pendente), exporte regularmente o XLSX e o DOCX e guarde-os no telemóvel ou na nuvem.
