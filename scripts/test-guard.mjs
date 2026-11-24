// Tests del hook .claude/hooks/guard.mjs: cada caso es un evento PreToolUse y el exit code esperado (2 = bloqueado).
import { spawnSync } from "node:child_process";
const bs = String.fromCharCode(92);
const cases = [
  ["env.local win path", { tool_name: "Write", tool_input: { file_path: `C:${bs}p${bs}.env.local`, content: "a" } }, 2],
  ["env.example win path", { tool_name: "Write", tool_input: { file_path: `C:${bs}p${bs}.env.example`, content: "a" } }, 0],
  ["edit migration", { tool_name: "Edit", tool_input: { file_path: "supabase/migrations/1_init.sql", old_string: "a", new_string: "b" } }, 2],
  ["new migration w/ service_role", { tool_name: "Write", tool_input: { file_path: "supabase/migrations/2_x.sql", content: "grant x to service_role;" } }, 0],
  ["service_role in ts", { tool_name: "Write", tool_input: { file_path: "src/a.ts", content: "service_role" } }, 2],
  ["db push", { tool_name: "Bash", tool_input: { command: "npx supabase db push" } }, 2],
  ["cat env", { tool_name: "Bash", tool_input: { command: "cat .env.local" } }, 2],
  ["verify", { tool_name: "Bash", tool_input: { command: "npm run verify" } }, 0],
  ["garbage", "not json", 2],
];
let fail = 0;
for (const [name, ev, want] of cases) {
  const r = spawnSync("node", [".claude/hooks/guard.mjs"], { input: typeof ev === "string" ? ev : JSON.stringify(ev) });
  const ok = r.status === want;
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: exit ${r.status} (esperado ${want})`);
}
process.exit(fail ? 1 : 0);
