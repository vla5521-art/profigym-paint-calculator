import { createReadStream, createWriteStream } from "node:fs";
import { access, chmod, mkdir, rm, symlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";

const root = process.cwd();
const source = path.join(root, "node_modules", "@sparticuz", "chromium", "bin");
const target = path.join(root, ".tmp", "chromium-runtime");
const executable = path.join(target, "chromium");
const ffmpegDir = path.join(root, ".tmp", "pw-browsers", "ffmpeg-1011");

await mkdir(ffmpegDir, { recursive: true });
try { await access(path.join(ffmpegDir, "ffmpeg-linux")); }
catch { await symlink("/usr/bin/ffmpeg", path.join(ffmpegDir, "ffmpeg-linux")); }

try {
  await access(executable);
  process.stdout.write(`${executable}\n`);
  process.exit(0);
} catch { /* extract below */ }

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await pipeline(createReadStream(path.join(source, "chromium.br")), createBrotliDecompress(), createWriteStream(executable, { mode: 0o700 }));
await chmod(executable, 0o700);

for (const archive of ["swiftshader.tar.br", "fonts.tar.br", "al2023.tar.br"]) {
  const tarPath = path.join(target, archive.replace(/\.br$/, ""));
  await pipeline(createReadStream(path.join(source, archive)), createBrotliDecompress(), createWriteStream(tarPath));
  await new Promise((resolve, reject) => {
    const child = spawn("tar", ["--no-same-owner", "-xf", tarPath, "-C", target], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`tar exited with ${code}`)));
  });
  await rm(tarPath, { force: true });
}

process.stdout.write(`${executable}\n`);
