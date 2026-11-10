# Jailbreaking e abliteração: jogar contra o aparelho

Slides do seminário de Gustavo Bonassa Bucker (TIDD/PUC-SP, IA Aplicada, 10/11/2026), com estética de terminal neon e **dois testes ao vivo** num terminal real dentro do navegador:

1. **sem adulteração**: um serviço online (pesos fechados, modelo alinhado);
2. **com adulteração**: um modelo abliterado rodando no Ollama.

Coautoria híbrida com Claude Opus 5.5 (ver o slide "Aviso de uso de IA").

## Como rodar (Windows + Git Bash)

Requisitos: [Node.js](https://nodejs.org) 18 ou mais novo, Git for Windows (Git Bash) e, para o teste 2, o [Ollama](https://ollama.com) com o modelo abliterado baixado.

```bash
git clone https://github.com/gbucker/seminario-jailbreaking.git
cd seminario-jailbreaking
npm install
cp .env.example .env      # preencha as chaves e o modelo
npm start
```

Abra **http://localhost:7681**. Os slides precisam ser abertos por esse endereço, e não pelo arquivo, para o terminal conectar.

**Versão web:** https://gbucker.github.io/seminario-jailbreaking/ (GitHub Pages). Quando os slides são abertos fora de `localhost`, os dois slides de teste ao vivo são retirados automaticamente (marcados com `data-live` no HTML). Aberto direto do disco (`file://`), tudo funciona, menos o terminal, e os slides de teste mostram como ligar o servidor.

## O `.env`

| variável | para quê |
|---|---|
| `ONLINE_BASE_URL`, `ONLINE_API_KEY`, `ONLINE_MODEL` | teste 1. Qualquer API no formato OpenAI (`/chat/completions`): OpenAI, OpenRouter, Anthropic, Gemini, Groq… |
| `OLLAMA_HOST`, `OLLAMA_MODEL` | teste 2. `OLLAMA_MODEL` com o nome exato de `ollama list` |
| `*_SYSTEM_PROMPT`, `*_TEMPERATURE`, `OLLAMA_THINK`, `OLLAMA_NUM_CTX` | opcionais |
| `SHELL_PATH` | shell do terminal; em branco, usa o Git Bash em `C:\Program Files\Git\bin\bash.exe` |
| `PORT` | porta do servidor (padrão 7681) |

O `.env` está no `.gitignore`.

## Durante a apresentação

- `→` / espaço avança, `←` volta, `F` tela cheia, `N` notas, `O` índice, `:` console.
- Nos slides de teste: **clique no terminal** para digitar; **Esc** devolve o teclado aos slides.
- `▶ chat online` / `▶ chat local` abre o chat. Os botões 📋 colam os prompts de `prompts/*.txt` (sem enviar); `↵ enviar` envia; `^C` interrompe.
- Dentro do chat: `/reset`, `/info`, `/system <texto>`, `/sair`.
- O terminal é um shell de verdade: dá para rodar `ollama list`, `ollama run …` etc.
- Cada sessão de chat fica registrada em `logs/` (fora do git), útil para documentar os testes.

Também funciona fora dos slides: `npm run chat -- online` ou, no terminal do seminário, `chat local "pergunta"`.

## Prompts

Coloque os prompts do teste em `prompts/*.txt` (um por arquivo; o nome do arquivo vira o rótulo do botão). Só `prompts/exemplo.txt` vai para o GitHub; os outros ficam locais.

## Segurança

O servidor escuta só em `127.0.0.1` e só aceita conexões de terminal vindas dos próprios slides (checagem de *Origin*). Não exponha a porta na rede.

## Estrutura

```
index.html            slides prontos (gerado; não edite)
src/template.html     fonte dos slides
build.py              embute o xterm.js no index.html  →  python build.py
vendor/               xterm.js 6.0.0 + addon-fit 0.11.0
server/server.mjs     servidor local: slides + WebSocket ↔ pty
tools/chat.mjs        cliente de chat (online / Ollama), com streaming e log
tools/seminario.bashrc  prompt e PATH do terminal dos slides
bin/chat              atalho para tools/chat.mjs
prompts/              prompts dos testes
```
