// Pick strings that appear in UI-display contexts and never in logic contexts.
const fs = require("fs");
const inv = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const UI = new Set(
  (process.env.UI_CTX ||
    "prop:children,prop:label,prop:title,prop:aria-label,prop:description,prop:placeholder,prop:detail,prop:text,prop:ariaLabel,prop:emptyText,prop:heading,prop:subtitle,prop:hint,prop:tooltip,prop:confirmLabel,prop:cancelLabel,prop:actionLabel,prop:alt,prop:helperText,prop:caption")
    .split(","),
);
const LOGIC = /^(bin:(===|!==|==|!=|in)|case|key|ckey|member|call:(Set|Map)#|prop:(_tag|type|value|id|name|kind|key|status|className|d)$|test)/;
const rows = [];
for (const e of inv) {
  const ctxs = Object.keys(e.ctx);
  if (!ctxs.some((c) => UI.has(c))) continue;
  const logic = ctxs.filter((c) => LOGIC.test(c));
  rows.push({ v: e.v, ui: ctxs.filter((c) => UI.has(c)).join(","), other: ctxs.filter((c) => !UI.has(c)).join(","), logic: logic.length > 0, files: e.files.join(",") });
}
fs.writeFileSync(process.argv[3], JSON.stringify(rows, null, 1));
console.log(rows.length, "candidates;", rows.filter((r) => r.logic).length, "also used in logic");
const byFile = {};
for (const r of rows) for (const f of r.files.split(",")) byFile[f] = (byFile[f] || 0) + 1;
console.log(Object.entries(byFile).sort((a, b) => b[1] - a[1]).map((x) => x.join("=")).join("  "));
