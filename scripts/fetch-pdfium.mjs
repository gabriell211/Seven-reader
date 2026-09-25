import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const platform = process.platform;
const arch = process.arch;

const matrix = {
  "win32-x64": ["pdfium-win-x64.tgz", "pdfium.dll"],
  "win32-arm64": ["pdfium-win-arm64.tgz", "pdfium.dll"],
  "linux-x64": ["pdfium-linux-x64.tgz", "libpdfium.so"],
  "linux-arm64": ["pdfium-linux-arm64.tgz", "libpdfium.so"],
  "darwin-x64": ["pdfium-mac-x64.tgz", "libpdfium.dylib"],
  "darwin-arm64": ["pdfium-mac-arm64.tgz", "libpdfium.dylib"]
};

const key = `${platform}-${arch}`;
const target = matrix[key];
if (!target) throw new Error(`PDFium prebuilt não configurado para ${key}`);

const [archiveName, libraryName] = target;
const url = `https://github.com/bblanchon/pdfium-binaries/releases/latest/download/${archiveName}`;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "seven-pdfium-"));
const archive = path.join(temp, archiveName);
const extract = path.join(temp, "extract");
const resources = path.join(process.cwd(), "src-tauri", "resources");
await fs.mkdir(extract, { recursive: true });
await fs.mkdir(resources, { recursive: true });

const response = await fetch(url, { redirect: "follow" });
if (!response.ok) throw new Error(`Falha ao baixar PDFium: HTTP ${response.status}`);
await fs.writeFile(archive, Buffer.from(await response.arrayBuffer()));

const tar = spawnSync("tar", ["-xzf", archive, "-C", extract], { stdio: "inherit" });
if (tar.status !== 0) throw new Error("Falha ao extrair PDFium");

const candidates = [
  path.join(extract, "lib", libraryName),
  path.join(extract, "bin", libraryName),
  path.join(extract, libraryName),
];

let source;
for (const candidate of candidates) {
  try {
    await fs.access(candidate);
    source = candidate;
    break;
  } catch {}
}
if (!source) throw new Error(`Biblioteca ${libraryName} não encontrada no pacote`);

await fs.copyFile(source, path.join(resources, libraryName));
console.log(`PDFium pronto: ${path.join(resources, libraryName)}`);
