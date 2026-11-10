#!/usr/bin/env node
// Cliente de chat para o teste ao vivo.
//   chat online            → serviço online (API compatível com OpenAI), modelo alinhado
//   chat local             → Ollama, modelo abliterado
//   chat online "pergunta" → uma pergunta só e sai
// Dentro do chat: /reset  /info  /system <texto>  /sair   (Ctrl+C interrompe a resposta)
// Cada sessão é registrada em logs/ (fora do git).

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV = loadEnv(ROOT);

const C = { r: "\x1b[0m", g: "\x1b[32m", G: "\x1b[92m", c: "\x1b[96m", m: "\x1b[95m", y: "\x1b[93m", red: "\x1b[91m", dim: "\x1b[90m", b: "\x1b[1m" };
const out = (s) => process.stdout.write(s);

// ---------- argumentos ----------
const argv = process.argv.slice(2);
const which = (argv[0] || "").toLowerCase();
if (!["online", "local"].includes(which)) {
  out(`${C.y}uso:${C.r} chat online | chat local   [pergunta]   [--system "texto"] [--temp 0.7]\n`);
  process.exit(1);
}
const opt = { system: null, temp: null, rest: [] };
for (let i = 1; i < argv.length; i++) {
  if (argv[i] === "--system") opt.system = argv[++i];
  else if (argv[i] === "--temp") opt.temp = parseFloat(argv[++i]);
  else opt.rest.push(argv[i]);
}

// ---------- perfis ----------
const P = which === "online"
  ? {
      kind: "openai", label: ENV.ONLINE_LABEL || "serviço online",
      base: (ENV.ONLINE_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
      key: ENV.ONLINE_API_KEY, model: ENV.ONLINE_MODEL,
      system: opt.system ?? ENV.ONLINE_SYSTEM_PROMPT ?? "",
      temp: opt.temp ?? (ENV.ONLINE_TEMPERATURE ? +ENV.ONLINE_TEMPERATURE : null),
      tag: "pesos fechados · alinhado (RLHF) · sem adulteração", color: C.c,
    }
  : {
      kind: "ollama", label: ENV.OLLAMA_LABEL || "Ollama local",
      base: (ENV.OLLAMA_HOST || "http://localhost:11434").replace(/\/+$/, ""),
      key: ENV.OLLAMA_API_KEY || "", model: ENV.OLLAMA_MODEL,
      system: opt.system ?? ENV.OLLAMA_SYSTEM_PROMPT ?? "",
      temp: opt.temp ?? (ENV.OLLAMA_TEMPERATURE ? +ENV.OLLAMA_TEMPERATURE : null),
      think: ENV.OLLAMA_THINK, ctx: ENV.OLLAMA_NUM_CTX ? +ENV.OLLAMA_NUM_CTX : null,
      tag: "pesos abertos · abliterado · com adulteração", color: C.m,
    };

if (!P.model) { out(`${C.red}✗ defina ${which === "online" ? "ONLINE_MODEL" : "OLLAMA_MODEL"} no .env${C.r}\n`); process.exit(1); }
if (P.kind === "openai" && !P.key) { out(`${C.red}✗ defina ONLINE_API_KEY no .env${C.r}\n`); process.exit(1); }

// ---------- log ----------
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const logDir = path.join(ROOT, "logs");
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, `${stamp}_${which}.md`);
const log = (s) => fs.appendFileSync(logFile, s);
log(`# Sessão ${which} · ${new Date().toLocaleString("pt-BR")}\n\n- serviço: ${P.label}\n- modelo: ${P.model}\n- endpoint: ${P.base}\n- system: ${P.system || "(nenhum)"}\n\n`);

// ---------- requisições ----------
let history = [];
const msgs = () => (P.system ? [{ role: "system", content: P.system }] : []).concat(history);

async function* streamOpenAI(signal) {
  const body = { model: P.model, messages: msgs(), stream: true };
  if (P.temp != null && !Number.isNaN(P.temp)) body.temperature = P.temp;
  const r = await fetch(`${P.base}/chat/completions`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${P.key}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} · ${(await r.text()).slice(0, 400)}`);
  const dec = new TextDecoder(); let buf = "";
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const d = JSON.parse(data).choices?.[0]?.delta || {};
        const th = d.reasoning_content || d.reasoning;
        if (th) yield { think: th };
        if (d.content) yield { text: d.content };
      } catch {}
    }
  }
}

async function* streamOllama(signal) {
  const body = { model: P.model, messages: msgs(), stream: true, options: {} };
  if (P.temp != null && !Number.isNaN(P.temp)) body.options.temperature = P.temp;
  if (P.ctx) body.options.num_ctx = P.ctx;
  if (P.think === "true" || P.think === "false") body.think = P.think === "true";
  const headers = { "Content-Type": "application/json" };
  if (P.key) headers.Authorization = `Bearer ${P.key}`;
  const r = await fetch(`${P.base}/api/chat`, { method: "POST", signal, headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status} · ${(await r.text()).slice(0, 400)}`);
  const dec = new TextDecoder(); let buf = "";
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const d = JSON.parse(line);
        if (d.error) throw new Error(d.error);
        if (d.message?.thinking) yield { think: d.message.thinking };
        if (d.message?.content) yield { text: d.message.content };
        if (d.done) return;
      } catch (e) { if (e.message && !e.message.startsWith("Unexpected")) throw e; }
    }
  }
}

let current = null; // AbortController da resposta em andamento

async function ask(text) {
  history.push({ role: "user", content: text });
  log(`**Interator:** ${text}\n\n`);
  current = new AbortController();
  const t0 = Date.now();
  let answer = "", thinking = "", mode = null, n = 0;
  out(`${P.color}${C.b}${P.model}${C.r}${C.dim} ›${C.r} `);
  try {
    const gen = P.kind === "openai" ? streamOpenAI(current.signal) : streamOllama(current.signal);
    for await (const ev of gen) {
      if (ev.think) {
        if (mode !== "think") { out(`${C.dim}[pensando] `); mode = "think"; }
        out(ev.think.replace(/\n/g, "\n  ")); thinking += ev.think;
      }
      if (ev.text) {
        if (mode === "think") out(`${C.r}\n${P.color}${C.b}${P.model}${C.r}${C.dim} ›${C.r} `);
        mode = "text"; out(ev.text); answer += ev.text; n++;
      }
    }
    out(`${C.r}\n${C.dim}  ↳ ${((Date.now() - t0) / 1000).toFixed(1)} s${C.r}\n\n`);
  } catch (e) {
    if (e.name === "AbortError") out(`${C.r}\n${C.y}  ↳ interrompido${C.r}\n\n`);
    else out(`${C.r}\n${C.red}  ✗ erro: ${e.message}${C.r}\n${C.dim}  confira o .env (${P.kind === "openai" ? "ONLINE_BASE_URL / ONLINE_API_KEY / ONLINE_MODEL" : "OLLAMA_HOST / OLLAMA_MODEL; o Ollama está rodando?"})${C.r}\n\n`);
  }
  current = null;
  if (answer) history.push({ role: "assistant", content: answer });
  else history.pop();
  log((thinking ? `<details><summary>raciocínio</summary>\n\n${thinking}\n\n</details>\n\n` : "") + `**${P.model}:** ${answer || "(sem resposta)"}\n\n---\n\n`);
}

// ---------- interface ----------
function banner() {
  const w = 62, line = "─".repeat(w);
  const row = (k, v) => `${C.dim}│${C.r} ${k.padEnd(9)}${v}`;
  out(`\n${P.color}┌${line}┐${C.r}\n`);
  out(`${row("serviço", `${P.color}${C.b}${P.label}${C.r}`)}\n`);
  out(`${row("modelo", P.model)}\n`);
  out(`${row("endpoint", C.dim + P.base + C.r)}\n`);
  out(`${row("estado", P.color + P.tag + C.r)}\n`);
  out(`${row("system", P.system ? C.y + P.system.slice(0, 48) + (P.system.length > 48 ? "…" : "") + C.r : C.dim + "(nenhum)" + C.r)}\n`);
  out(`${P.color}└${line}┘${C.r}\n${C.dim}  /reset  /info  /system <texto>  /sair   ·   Ctrl+C interrompe a resposta${C.r}\n\n`);
}

if (opt.rest.length) { await ask(opt.rest.join(" ")); process.exit(0); }

banner();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: `${C.G}você ›${C.r} ` });
rl.on("SIGINT", () => { if (current) current.abort(); else { out(`\n${C.dim}(use /sair para fechar)${C.r}\n`); rl.prompt(); } });
rl.prompt();
let busy = false;
rl.on("line", async (line) => {
  const t = line.trim();
  if (busy) return;
  if (!t) return rl.prompt();
  if (t === "/sair" || t === "/exit" || t === "/quit") { out(`${C.dim}log salvo em logs/${path.basename(logFile)}${C.r}\n`); rl.close(); return; }
  if (t === "/reset") { history = []; out(`${C.y}↺ histórico apagado${C.r}\n\n`); log("_(histórico apagado)_\n\n"); return rl.prompt(); }
  if (t === "/info") { banner(); out(`${C.dim}  turnos: ${history.length / 2}${C.r}\n\n`); return rl.prompt(); }
  if (t.startsWith("/system")) { P.system = t.slice(7).trim(); out(`${C.y}system: ${P.system || "(nenhum)"}${C.r}\n\n`); log(`_(system: ${P.system})_\n\n`); return rl.prompt(); }
  busy = true; rl.pause();
  await ask(t);
  busy = false; rl.resume(); rl.prompt();
});
rl.on("close", () => process.exit(0));
