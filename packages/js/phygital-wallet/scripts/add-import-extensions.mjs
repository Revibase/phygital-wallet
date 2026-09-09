import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(packageRoot, "src");

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(path));
      continue;
    }
    if (entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

function fixSpec(dir, spec) {
  if (spec.endsWith(".js")) {
    return spec;
  }

  const resolved = join(dir, spec);
  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    return `${spec}/index.js`;
  }
  if (existsSync(`${resolved}.ts`)) {
    return `${spec}.js`;
  }
  return spec;
}

function fixFile(file) {
  const dir = dirname(file);
  const source = readFileSync(file, "utf8");
  const updated = source.replace(
    /(from|export \* from) "(\.\.?\/[^"]+)"/g,
    (match, keyword, spec) => {
      const fixed = fixSpec(dir, spec);
      return fixed === spec ? match : `${keyword} "${fixed}"`;
    },
  );

  if (updated !== source) {
    writeFileSync(file, updated);
  }
}

for (const file of walk(srcRoot)) {
  fixFile(file);
}
