// Exports the contract as JSON Schema so the R models (and humans) have a
// language-agnostic spec to validate against. Writes into <feed>/_schema/.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { PicksFileSchema, ResultsFileSchema, feedDir } from "../src/index";

const outDir = join(feedDir(), "_schema");
mkdirSync(outDir, { recursive: true });

const picks = zodToJsonSchema(PicksFileSchema, { name: "PicksFile", $refStrategy: "none" });
const results = zodToJsonSchema(ResultsFileSchema, { name: "ResultsFile", $refStrategy: "none" });

writeFileSync(join(outDir, "picks.schema.json"), JSON.stringify(picks, null, 2));
writeFileSync(join(outDir, "results.schema.json"), JSON.stringify(results, null, 2));

console.log(`Wrote JSON Schema to ${outDir}`);
console.log("  - picks.schema.json");
console.log("  - results.schema.json");
