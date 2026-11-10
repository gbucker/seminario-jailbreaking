// Leitor mínimo de .env (sem dependências). Variáveis já definidas no ambiente têm prioridade.
import fs from "node:fs";
import path from "node:path";

export function loadEnv(root) {
  const out = {};
  const file = path.join(root, ".env");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if (/^".*"$/.test(v)) v = v.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
      else if (/^'.*'$/.test(v)) v = v.slice(1, -1);
      else v = v.replace(/\s+#.*$/, "");
      out[m[1]] = v;
    }
  }
  for (const k of Object.keys(out)) if (process.env[k] !== undefined && process.env[k] !== "") out[k] = process.env[k];
  return out;
}
