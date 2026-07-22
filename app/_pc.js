const ts = require("typescript");
const fs = require("fs");
const files = [
  "src/app/(app)/sales/SalesTable.tsx",
  "src/app/(app)/invoices/[id]/InvoiceCorrectionPanel.tsx",
  "src/app/(app)/invoices/[id]/page.tsx",
  "src/lib/actions/sales.ts",
  "src/lib/data/sales.ts",
];
let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  // count parse diagnostics
  const d = sf.parseDiagnostics || [];
  console.log((d.length ? "FAIL " + d.length : "PARSE_OK") + "  " + f);
  bad += d.length;
}
console.log("TOTAL_PARSE_ERRORS=" + bad);
