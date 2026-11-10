# AGENTS.md

Instruções para agentes que editarem este repositório.

## Slides
- Edite **sempre** `src/template.html` e rode `python build.py`. Nunca edite `index.html` à mão: ele é gerado, com o xterm.js embutido nos marcadores `/*XTERM_CSS*/`, `/*XTERM_JS*/`, `/*XTERM_FIT*/`.
- Padrão visual e motor: skill *slides-terminal-neon* (palco fixo 1600×900; não use os 90 px de baixo; magenta só para leituras do apresentador; títulos como `<h1 class="cmd">`).
- Cada slide é `<section class="slide" data-id data-title>`; passos com `.frag` / `data-f` / `data-steps`; hooks em `H[data-id]` (`init`, `enter`, `leave`, `step(s,n,jump)`, `tick`). `step` deve ser idempotente e não animar quando `jump` for verdadeiro.
- Citações diretas são literais, com página. As páginas de Ferrari e Bucker (2026) foram contadas no PDF da *Bakhtiniana* (sem numeração impressa).
- O slide `aviso-ia` (arrays `AV_EU`, `AV_IA`, `AV_CHK`) deve ser atualizado a cada mudança feita com IA.

## Terminal ao vivo
- `server/server.mjs` serve `index.html` e `vendor/` e abre um pty por WebSocket em `/pty` (só para Origin `http://localhost:PORT` / `http://127.0.0.1:PORT`).
- No navegador, o xterm fica **fora** do `#stage` (que é escalado com `transform`): um `.termhost` em `position:fixed` é posicionado sobre o `.slot` de cada `.twin`. Não mova o terminal para dentro do palco.
- `tools/chat.mjs` lê o `.env`: perfil `online` (API compatível com OpenAI) e `local` (API nativa do Ollama, `/api/chat`). Sem dependências além do Node 18+.
- Scripts de shell precisam de LF (ver `.gitattributes`).

## Verificação
Antes de entregar: percorra todos os slides com `→` e `←` no Playwright, capturando `pageerror`, e olhe screenshots de cada slide. Teste o terminal com um servidor falso (OpenAI e Ollama) e o `.env` apontando para ele.
