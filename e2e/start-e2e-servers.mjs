import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const runtime = path.join(root, ".tmp", "e2e-runtime");
await rm(runtime, { recursive: true, force: true });
await Promise.all(["uploads", "storage", "reports", "mesh-cache"].map((name) => mkdir(path.join(runtime, name), { recursive: true })));

const env = {
  ...process.env,
  CAD_API_PORT: "8787",
  CAD_UPLOAD_DIR: path.join(runtime, "uploads"),
  CAD_CALCULATION_STORAGE_PATH: path.join(runtime, "storage"),
  CAD_DATABASE_PATH: path.join(runtime, "storage", "e2e.sqlite"),
  CAD_REPORT_DIR: path.join(runtime, "reports"),
  CAD_MESH_CACHE_DIR: path.join(runtime, "mesh-cache"),
  CAD_SOURCE_FILE_RETENTION_ENABLED: "true",
  NODE_ENV: "test",
  CAD_JOB_TIMEOUT_MS: "250",
  CAD_TEST_PROCESSING_DELAY_MS: "300",
  CAD_TEST_TIMEOUT_FIXTURE: "timeout_fixture.step",
  RATE_LIMIT_UPLOAD: "1000",
  RATE_LIMIT_READ: "10000",
  RATE_LIMIT_WRITE: "1000",
  RATE_LIMIT_REPORT: "1000",
  RATE_LIMIT_RECALCULATE: "1000",
};

const children = [
  spawn(process.execPath, ["server/index.js"], { cwd: root, env, stdio: "inherit" }),
  spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], { cwd: root, env, stdio: "inherit" }),
];

let stopping = false;
const stop = (signal = "SIGTERM") => {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill(signal);
};
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
for (const child of children) child.on("exit", (code) => {
  if (!stopping && code !== 0) { stop(); process.exitCode = code ?? 1; }
});
await new Promise(() => undefined);
