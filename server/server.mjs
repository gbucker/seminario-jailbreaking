// Servidor local do seminário: serve os slides e abre terminais reais no navegador.
// Uso: npm start  →  http://localhost:7681
//
// Segurança: escuta só em 127.0.0.1 e aceita WebSocket apenas de páginas servidas
// por este mesmo servidor (checagem de Origin). Um terminal aberto aqui é um shell
// de verdade na sua máquina: não exponha a porta na rede.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { loadEnv } from "../tools/env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV = loadEnv(ROOT);
const PORT = +(ENV.PORT || 7681);
const HOST = "127.0.0.1";
const IS_WIN = process.platform === "win32";

// ---------- shell ----------
function findShell() {
  if (ENV.SHELL_PATH) return ENV.SHELL_PATH;
  if (IS_WIN) {
    const cands = [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
      path.join(os.homedir(), "AppData\\Local\\Programs\\Git\\bin\\bash.exe"),
    ];
    for (const c of cands) if (fs.existsSync(c)) return c;
    return "powershell.exe";
  }
  return process.env.SHELL || "/bin/bash";
}
const SHELL = findShell();
const IS_BASH = /bash(\.exe)?$/i.test(SHELL);

// C:\Users\x\repo → /c/Users/x/repo (formato que o Git Bash entende)
const toPosix = (p) => (IS_WIN ? p.replace(/^([A-Za-z]):/, (_, d) => "/" + d.toLowerCase()).replace(/\\/g, "/") : p);

// ---------- http ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

function listPrompts() {
  const dir = path.join(ROOT, "prompts");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()
    .map((f) => ({ name: f.replace(/\.txt$/, ""), text: fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n").trim() }));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (code, body, type = "application/json") => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(body); };
  if (url.pathname === "/api/health") {
    return send(200, JSON.stringify({
      ok: true, shell: path.basename(SHELL), platform: process.platform,
      online: { label: ENV.ONLINE_LABEL || "online", model: ENV.ONLINE_MODEL || null, configured: !!(ENV.ONLINE_API_KEY && ENV.ONLINE_MODEL) },
      local: { label: ENV.OLLAMA_LABEL || "ollama", model: ENV.OLLAMA_MODEL || null, host: ENV.OLLAMA_HOST || "http://localhost:11434" },
    }));
  }
  if (url.pathname === "/api/prompts") return send(200, JSON.stringify(listPrompts()));
  let p = decodeURIComponent(url.pathname);
  if (p === "/") p = "/index.html";
  const file = path.normalize(path.join(ROOT, p));
  const allowed = [path.join(ROOT, "index.html"), path.join(ROOT, "vendor")];
  if (!allowed.some((a) => file === a || file.startsWith(a + path.sep)) || !fs.existsSync(file)) return send(404, "404", "text/plain");
  send(200, fs.readFileSync(file), MIME[path.extname(file)] || "application/octet-stream");
});

// ---------- websocket + pty ----------
let pty;
try { pty = (await import("@lydell/node-pty")).default ?? (await import("@lydell/node-pty")); }
catch (e) { console.error("✗ não consegui carregar @lydell/node-pty. Rode `npm install`.\n", e.message); process.exit(1); }

const ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, sock, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/pty" || !ORIGINS.has(req.headers.origin)) {
    console.warn(`✗ conexão recusada (origin: ${req.headers.origin || "—"})`);
    sock.write("HTTP/1.1 403 Forbidden\r\n\r\n"); return sock.destroy();
  }
  wss.handleUpgrade(req, sock, head, (ws) => wss.emit("connection", ws, url));
});

wss.on("connection", (ws, url) => {
  const cols = Math.max(20, +url.searchParams.get("cols") || 100);
  const rows = Math.max(5, +url.searchParams.get("rows") || 30);
  const tag = (url.searchParams.get("tag") || "sessao").replace(/[^\w-]/g, "");
  const env = {
    ...process.env, ...ENV,
    TERM: "xterm-256color", COLORTERM: "truecolor", CHERE_INVOKING: "1",
    SEMINARIO_ROOT: toPosix(ROOT), SEMINARIO_TAG: tag,
  };
  const args = IS_BASH ? ["--rcfile", toPosix(path.join(ROOT, "tools", "seminario.bashrc")), "-i"] : [];
  let term;
  try {
    term = pty.spawn(SHELL, args, { name: "xterm-256color", cols, rows, cwd: ROOT, env, useConpty: IS_WIN ? true : undefined });
  } catch (e) {
    ws.send(`\r\n\x1b[31m✗ não consegui abrir o shell (${SHELL}): ${e.message}\x1b[0m\r\n`); return ws.close();
  }
  console.log(`▸ terminal [${tag}] aberto · ${path.basename(SHELL)} · pid ${term.pid}`);
  term.onData((d) => { if (ws.readyState === 1) ws.send(d); });
  term.onExit(({ exitCode }) => { if (ws.readyState === 1) { ws.send(`\r\n\x1b[90m[processo encerrado: ${exitCode}]\x1b[0m\r\n`); ws.close(); } });
  ws.on("message", (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.t === "i" && typeof m.d === "string") term.write(m.d);
    else if (m.t === "r" && m.c > 0 && m.r > 0) { try { term.resize(m.c | 0, m.r | 0); } catch {} }
  });
  ws.on("close", () => { try { term.kill(); } catch {} console.log(`▸ terminal [${tag}] fechado`); });
});

server.listen(PORT, HOST, () => {
  console.log(`\n  $ seminario --jailbreaking`);
  console.log(`  slides:   http://localhost:${PORT}`);
  console.log(`  shell:    ${SHELL}`);
  console.log(`  online:   ${ENV.ONLINE_MODEL || "(defina ONLINE_MODEL no .env)"}`);
  console.log(`  ollama:   ${ENV.OLLAMA_MODEL || "(defina OLLAMA_MODEL no .env)"} @ ${ENV.OLLAMA_HOST || "http://localhost:11434"}`);
  console.log(`  Ctrl+C para sair\n`);
});
