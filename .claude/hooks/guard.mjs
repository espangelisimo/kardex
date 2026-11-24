// PreToolUse hook: bloquea escrituras peligrosas antes de que ocurran.
// Lee el evento JSON por stdin. Exit 2 = bloquear (stderr se devuelve al agente como motivo).
import { readFileSync } from "node:fs";

const block = (reason) => {
  process.stderr.write(`[guard] ${reason}\n`);
  process.exit(2);
};

// Fail-closed: con exit 1 Claude Code dejaría pasar la herramienta. Si no podemos leer el evento, bloqueamos.
let event;
try {
  event = JSON.parse(readFileSync(0, "utf8"));
} catch (err) {
  block(`No se pudo leer el evento del hook (${err.message}). Bloqueado por precaución.`);
}
const input = event.tool_input ?? {};

const path = String(input.file_path ?? "").replaceAll("\\", "/");

if (["Edit", "Write", "MultiEdit"].includes(event.tool_name)) {
  if (/(^|\/)\.env(\.|$)/.test(path) && !path.endsWith(".env.example")) {
    block("No se escriben archivos .env desde un agente. Los secretos los gestiona el humano.");
  }
  if (path.endsWith("docs/DIRECTRICES.md")) {
    block("docs/DIRECTRICES.md solo cambia con aprobación humana (ver CLAUDE.md).");
  }
  if (/supabase\/migrations\/.+\.sql$/.test(path) && event.tool_name === "Edit") {
    block("No se editan migraciones existentes (D-05). Crea una migración nueva.");
  }
  const content = String(input.content ?? input.new_string ?? "");
  // En SQL "service_role" es un rol legítimo (grants/políticas); en TS/JS no debería aparecer.
  const roleRe = path.endsWith(".sql") ? "" : "service_role|";
  if (new RegExp(`${roleRe}sb_secret_[A-Za-z0-9]|eyJhbGciOi[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}`).test(content)) {
    block("El contenido parece contener una clave o un JWT (S-01). Usa variables de entorno.");
  }
}

if (event.tool_name === "Bash") {
  const cmd = String(input.command ?? "");
  if (/git\s+push\s+.*(--force|-f\b)/.test(cmd)) block("Prohibido git push --force.");
  if (/supabase\s+db\s+(push|reset)\b.*--linked|supabase\s+db\s+push\b/.test(cmd)) {
    block("Las migraciones al proyecto remoto las aplica el humano.");
  }
  if (/\b(cat|type|Get-Content)\b[^|]*\.env(?!\.example)/.test(cmd)) {
    block("No se leen archivos .env desde un agente.");
  }
}

process.exit(0);
