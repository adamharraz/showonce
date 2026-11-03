// Start the real FastAPI app in the managed preview, using a local runtime dependency.
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const port = option("--port", process.env.PORT || "4173");
const host = option("--host", "0.0.0.0");
const portable = path.resolve(".preview-runtime/bin/python3.12");
const local = path.resolve(
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python",
);
const python =
  process.env.SHOWONCE_PYTHON ||
  (existsSync(portable)
    ? portable
    : existsSync(local)
      ? local
      : process.platform === "win32"
        ? "python"
        : "python3");
const env = {
  ...process.env,
  PYTHONPATH: path.resolve("backend"),
  DEMO_MODE: "true",
  ALLOW_LOCAL_LOGIN: "false",
  STORAGE_MODE: "local",
  DATA_DIR: path.resolve(".data-preview"),
  APP_ORIGIN:
    process.env.APP_ORIGIN ||
    `http://${process.env.SITES_MANAGED_LINUX_CONTAINER === "1" || (args.includes("--strictPort") && existsSync(portable)) ? "terminal.local" : "127.0.0.1"}:${port}`,
};
const child = spawn(
  python,
  ["-m", "uvicorn", "app.main:app", "--host", host, "--port", String(port)],
  { stdio: "inherit", env },
);
child.on("error", (error) => {
  console.error("Python preview dependency unavailable:", error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
