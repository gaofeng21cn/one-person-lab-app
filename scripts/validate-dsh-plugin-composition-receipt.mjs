import fs from "node:fs";
import path from "node:path";

const [receiptPath = "composition_receipt.json", studioRoot = "."] = process.argv.slice(2);
const receipt = JSON.parse(fs.readFileSync(path.resolve(receiptPath), "utf8"));
if (receipt.schema !== "opl_dsh_plugin_composition_receipt.v1") throw new Error("Unexpected DSH plugin composition receipt schema");
if (!/^[0-9a-f]{40}$/.test(receipt.tested_on_sha ?? "")) throw new Error("Receipt is not bound to an exact Studio commit");
if (typeof receipt.dsh_cohort !== "string" || !receipt.dsh_cohort) throw new Error("Receipt has no DSH cohort");
if (!receipt.plugins || typeof receipt.plugins !== "object" || Array.isArray(receipt.plugins)) throw new Error("Receipt has no plugin map");

const studioPackage = JSON.parse(fs.readFileSync(path.join(path.resolve(studioRoot), "package.json"), "utf8"));
const cohort = String(studioPackage.dependencies?.["@deepseek-ai/dsh-app-boot"] ?? "").replace(/^[^0-9]*/, "");
if (cohort !== receipt.dsh_cohort) throw new Error(`Receipt DSH cohort ${receipt.dsh_cohort} does not match Studio cohort ${cohort}`);
const publishable = fs.readdirSync(path.join(path.resolve(studioRoot), "plugins"), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => JSON.parse(fs.readFileSync(path.join(path.resolve(studioRoot), "plugins", entry.name, "package.json"), "utf8")))
  .filter(manifest => manifest.publishConfig?.registry === receipt.registry && manifest.private !== true)
  .map(manifest => manifest.name)
  .sort();
const actual = Object.keys(receipt.plugins).sort();
if (JSON.stringify(actual) !== JSON.stringify(publishable)) {
  throw new Error(`Receipt plugin set mismatch; expected published Studio packages ${publishable.join(", ")}, got ${actual.join(", ")}`);
}
for (const [name, version] of Object.entries(receipt.plugins)) {
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`${name} is not pinned to an exact semver version`);
}
console.log(JSON.stringify({ schema: "opl_app_dsh_plugin_composition_admission.v1", status: "admitted", tested_on_sha: receipt.tested_on_sha, dsh_cohort: receipt.dsh_cohort, plugins: receipt.plugins }, null, 2));
