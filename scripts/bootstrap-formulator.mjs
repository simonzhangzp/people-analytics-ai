import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DF_COMMIT = "5477f0e236426dc8f74a498ec400414fba7fbc0f";
const DF_REPO = "https://github.com/microsoft/data-formulator.git";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendor = path.join(root, "vendor", "data-formulator");
const envExample = path.join(root, "apps", "formulator", ".env.example");
const envFile = path.join(root, "apps", "formulator", ".env");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(path.join(vendor, ".git"))) {
  mkdirSync(path.dirname(vendor), { recursive: true });
  run("git", ["clone", DF_REPO, vendor], root);
}

run("git", ["fetch", "--depth", "1", "origin", DF_COMMIT], vendor);
const head = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: vendor,
  encoding: "utf8",
});
if ((head.stdout || "").trim() !== DF_COMMIT) {
  run("git", ["checkout", "--detach", DF_COMMIT], vendor);
}

if (!existsSync(envFile) && existsSync(envExample)) {
  copyFileSync(envExample, envFile);
  console.log(`Created ${path.relative(root, envFile)} from .env.example`);
}

console.log(`Data Formulator ready at ${path.relative(root, vendor)} @ ${DF_COMMIT}`);
