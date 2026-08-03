import { createReadStream, createWriteStream } from "node:fs";
import { constants as fsConstants } from "node:fs";
import { access, chmod, lstat, mkdir, mkdtemp, readlink, rename, rm, symlink, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";

const defaultFs = { access, chmod, lstat, mkdir, mkdtemp, readlink, rename, rm, symlink, unlink };

export function playwrightFfmpegName(platform = process.platform) {
  if (platform === "win32") return "ffmpeg-win64.exe";
  if (platform === "darwin") return "ffmpeg-mac";
  return "ffmpeg-linux";
}

async function isUsableFile(file, platform, fsApi = defaultFs) {
  try {
    const info = await fsApi.lstat(file);
    if (!info.isFile() && !info.isSymbolicLink()) return false;
    await fsApi.access(file, platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findOnPath(name, platform, env, fsApi = defaultFs) {
  const directories = String(env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const suffixes = platform === "win32"
    ? String(env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
    : [""];
  for (const directory of directories) {
    for (const suffix of suffixes) {
      const candidate = path.join(directory, platform === "win32" ? `${name}${suffix}` : name);
      if (await isUsableFile(candidate, platform, fsApi)) return candidate;
    }
  }
  return null;
}

export async function resolveSystemFfmpeg({ platform = process.platform, env = process.env, fsApi = defaultFs } = {}) {
  if (env.PLAYWRIGHT_FFMPEG_PATH) return path.resolve(env.PLAYWRIGHT_FFMPEG_PATH);
  if (platform === "linux" && await isUsableFile("/usr/bin/ffmpeg", platform, fsApi)) return "/usr/bin/ffmpeg";
  return findOnPath("ffmpeg", platform, env, fsApi);
}

export async function ensurePlaywrightFfmpeg({
  root = process.cwd(),
  platform = process.platform,
  env = process.env,
  fsApi = defaultFs,
  logger = (message) => process.stdout.write(`${message}\n`),
  maxAttempts = 8,
} = {}) {
  const directory = path.join(root, ".tmp", "pw-browsers", "ffmpeg-1011");
  const target = path.join(directory, playwrightFfmpegName(platform));
  await fsApi.mkdir(directory, { recursive: true });

  const source = await resolveSystemFfmpeg({ platform, env, fsApi });
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let targetInfo = null;
    try {
      targetInfo = await fsApi.lstat(target);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    if (targetInfo?.isFile() && await isUsableFile(target, platform, fsApi)) {
      logger(`Playwright ffmpeg ready: existing executable ${target}`);
      return { status: "existing-file", source: target, target };
    }

    if (targetInfo?.isSymbolicLink()) {
      const linkValue = await fsApi.readlink(target);
      const resolvedLink = path.resolve(directory, linkValue);
      if (source && resolvedLink === path.resolve(source) && await isUsableFile(target, platform, fsApi)) {
        logger(`Playwright ffmpeg ready: existing symlink ${target} -> ${linkValue}`);
        return { status: "existing-symlink", source, target };
      }
      try {
        await fsApi.unlink(target);
        logger(`Removed stale Playwright ffmpeg symlink: ${target} -> ${linkValue}`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      targetInfo = null;
    } else if (targetInfo) {
      throw new Error(`Playwright ffmpeg target exists but is not a usable file or symlink: ${target}`);
    }

    if (!source || !await isUsableFile(source, platform, fsApi)) {
      throw new Error(`System ffmpeg executable was not found; set PLAYWRIGHT_FFMPEG_PATH (target: ${target})`);
    }

    try {
      await fsApi.symlink(source, target, platform === "win32" ? "file" : undefined);
      logger(`Created Playwright ffmpeg symlink: ${target} -> ${source}`);
      return { status: "created-symlink", source, target };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      logger(`Concurrent ffmpeg preparation detected at ${target}; rechecking (attempt ${attempt}/${maxAttempts})`);
    }
  }

  if (await isUsableFile(target, platform, fsApi)) {
    logger(`Playwright ffmpeg ready after concurrent preparation: ${target}`);
    return { status: "existing-after-race", source, target };
  }
  throw new Error(`Unable to prepare Playwright ffmpeg after ${maxAttempts} attempts: ${target}`);
}

async function extractArchive(archivePath, target) {
  const tarPath = path.join(target, path.basename(archivePath).replace(/\.br$/, ""));
  await pipeline(createReadStream(archivePath), createBrotliDecompress(), createWriteStream(tarPath));
  await new Promise((resolve, reject) => {
    const child = spawn("tar", ["--no-same-owner", "-xf", tarPath, "-C", target], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`tar exited with ${code}`)));
  });
  await rm(tarPath, { force: true });
}

export async function ensureChromiumRuntime({ root = process.cwd(), logger = (message) => process.stdout.write(`${message}\n`) } = {}) {
  const source = path.join(root, "node_modules", "@sparticuz", "chromium", "bin");
  const target = path.join(root, ".tmp", "chromium-runtime");
  const executable = path.join(target, "chromium");
  if (await isUsableFile(executable, process.platform)) {
    logger(`Chromium runtime ready: ${executable}`);
    return executable;
  }

  const temporary = await mkdtemp(path.join(root, ".tmp", "chromium-runtime-"));
  const temporaryExecutable = path.join(temporary, "chromium");
  try {
    await pipeline(createReadStream(path.join(source, "chromium.br")), createBrotliDecompress(), createWriteStream(temporaryExecutable, { mode: 0o700 }));
    await chmod(temporaryExecutable, 0o700);
    for (const archive of ["swiftshader.tar.br", "fonts.tar.br", "al2023.tar.br"]) {
      await extractArchive(path.join(source, archive), temporary);
    }

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        await rename(temporary, target);
        logger(`Chromium runtime prepared atomically: ${executable}`);
        return executable;
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
        if (await isUsableFile(executable, process.platform)) {
          logger(`Chromium runtime prepared by a concurrent process: ${executable}`);
          return executable;
        }
        await rm(target, { recursive: true, force: true });
        logger(`Removed incomplete Chromium runtime before retry ${attempt}/4: ${target}`);
      }
    }
    throw new Error(`Unable to publish Chromium runtime atomically: ${target}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function prepareE2eChromium({ root = process.cwd(), ffmpegOnly = false } = {}) {
  await ensurePlaywrightFfmpeg({ root });
  if (ffmpegOnly) return null;
  return ensureChromiumRuntime({ root });
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const executable = await prepareE2eChromium({ ffmpegOnly: process.argv.includes("--ffmpeg-only") });
  if (executable) process.stdout.write(`${executable}\n`);
}
