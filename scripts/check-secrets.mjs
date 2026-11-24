// Escaneo de secretos sobre los archivos que git va a versionar (seguidos + nuevos no ignorados).
// Sin dependencias, para que funcione igual en local, en el hook y en CI.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !f.startsWith("node_modules/") && f !== "scripts/check-secrets.mjs" && f !== ".claude/hooks/guard.mjs" && f !== "scripts/test-guard.mjs");

const rules = [
  ["JWT (posible key de Supabase)", /eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
  ["Secret key de Supabase", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["Uso de service_role en la app", /service_role/i],
  ["Clave privada", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Token de GitHub", /gh[pousr]_[A-Za-z0-9]{30,}/],
  ["Cadena de conexión con contraseña", /postgres(ql)?:\/\/[^:\s]+:[^@\s]+@(?!127\.0\.0\.1|localhost)/],
];

// En SQL, "service_role" es un nombre de rol legítimo en políticas/grants.
const allow = (file, name) => name === "Uso de service_role en la app" && /\.(sql|md|toml)$/.test(file);

const findings = [];
for (const file of files) {
  if (/\.(png|jpg|ico|woff2?|lock)$/.test(file) || file === "package-lock.json") continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  text.split("\n").forEach((line, i) => {
    for (const [name, re] of rules) {
      if (re.test(line) && !allow(file, name)) findings.push(`${file}:${i + 1}  ${name}`);
    }
  });
}

if (findings.length) {
  console.error("✗ Posibles secretos encontrados (S-01):\n  " + findings.join("\n  "));
  process.exit(1);
}
console.log(`✓ Sin secretos en ${files.length} archivos`);
