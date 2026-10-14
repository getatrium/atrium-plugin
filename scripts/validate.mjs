// Structural checks for the plugin: manifests, skill frontmatter, and paths.
// Schema conformance is checked separately in CI against Cursor's published schemas.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const errors = [];
const fail = (msg) => errors.push(msg);
const NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function readJson(rel) {
  try {
    return JSON.parse(readFileSync(join(root, rel), "utf8"));
  } catch (err) {
    fail(`${rel}: ${err.message}`);
    return {};
  }
}

function checkPath(label, rel) {
  if (typeof rel !== "string") return;
  if (isAbsolute(rel) || normalize(rel).startsWith("..")) fail(`${label}: path must be relative and inside the repo: ${rel}`);
  else if (!existsSync(join(root, rel))) fail(`${label}: ${rel} does not exist`);
}

const plugin = readJson(".cursor-plugin/plugin.json");
if (!NAME.test(plugin.name ?? "")) fail(`plugin.json: name must be lowercase kebab-case: ${plugin.name}`);
checkPath("plugin.json logo", plugin.logo);
checkPath("plugin.json skills", plugin.skills);

const marketplace = readJson(".cursor-plugin/marketplace.json");
for (const entry of marketplace.plugins ?? []) {
  checkPath(`marketplace.json ${entry.name} source`, entry.source);
  if (entry.name !== plugin.name) fail(`marketplace.json: entry ${entry.name} does not match plugin name ${plugin.name}`);
}

const skillsDir = join(root, "skills");
for (const dir of readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const rel = `skills/${dir.name}/SKILL.md`;
  if (!existsSync(join(root, rel))) {
    fail(`${rel} is missing`);
    continue;
  }
  const text = readFileSync(join(root, rel), "utf8");
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatter) {
    fail(`${rel}: missing frontmatter`);
    continue;
  }
  const field = (key) => frontmatter[1].match(new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, "m"))?.[1];
  const name = field("name");
  const description = field("description") ?? "";
  const compatibility = field("compatibility") ?? "";
  if (name !== dir.name) fail(`${rel}: name "${name}" must match its folder "${dir.name}"`);
  if (!NAME.test(name ?? "") || name.length > 64) fail(`${rel}: invalid skill name "${name}"`);
  if (description.length < 1 || description.length > 1024) fail(`${rel}: description must be 1-1024 characters (${description.length})`);
  if (compatibility.length > 500) fail(`${rel}: compatibility must be at most 500 characters (${compatibility.length})`);
  const lines = text.split("\n").length;
  if (lines > 500) fail(`${rel}: ${lines} lines; keep SKILL.md under 500`);
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log("✓ plugin structure is valid");
