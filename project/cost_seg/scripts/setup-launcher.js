import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  return result.status ?? 1;
}

try {
  if (process.platform === "darwin") {
    const script = path.join(__dirname, "setup-mac-launcher.sh");
    process.exit(run("bash", [script]));
  }

  if (process.platform === "win32") {
    const script = path.join(__dirname, "setup-windows-launcher.ps1");
    process.exit(
      run("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script,
      ])
    );
  }

  console.log("Skipping launcher setup: unsupported OS.");
  process.exit(0);
} catch (error) {
  console.warn("Launcher setup skipped:", error?.message || error);
  process.exit(0);
}
