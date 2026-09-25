import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = process.cwd();
const svgPath = path.join(root, "public", "seven-reader.svg");
const out = path.join(root, "src-tauri", "icons");
const installer = path.join(root, "src-tauri", "installer");

await fs.mkdir(out, { recursive: true });
await fs.mkdir(installer, { recursive: true });

const svg = await fs.readFile(svgPath);
const sizes = [32, 128, 256, 512];

for (const size of sizes) {
  await sharp(svg).resize(size, size).png().toFile(path.join(out, `${size}x${size}.png`));
}

await sharp(svg).resize(128, 128).png().toFile(path.join(out, "128x128@2x.png"));
await sharp(svg).resize(512, 512).png().toFile(path.join(out, "icon.png"));

const ico = await pngToIco([
  path.join(out, "32x32.png"),
  path.join(out, "128x128.png"),
  path.join(out, "256x256.png"),
]);
await fs.writeFile(path.join(out, "icon.ico"), ico);

const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">
  <rect width="150" height="57" fill="#111318"/>
  <rect x="10" y="9" width="39" height="39" rx="10" fill="#7043EF"/>
  <path d="M18 21h24l-3 6-7 2-7 16h-7l8-18h-8v-6Z" fill="#fff"/>
  <text x="58" y="27" fill="#fff" font-family="Segoe UI,Arial" font-size="15" font-weight="700">Seven Reader</text>
  <text x="58" y="42" fill="#9E9FA8" font-family="Segoe UI,Arial" font-size="8">READ · EDIT · CONVERT</text>
</svg>`);
await sharp(header).png().toFile(path.join(installer, "header.png"));

const sidebar = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#111318"/><stop offset="1" stop-color="#251A3B"/></linearGradient></defs>
  <rect width="164" height="314" fill="url(#bg)"/>
  <circle cx="140" cy="35" r="90" fill="#7043EF" opacity=".22"/>
  <rect x="24" y="34" width="58" height="58" rx="15" fill="#7043EF"/>
  <path d="M36 52h35l-4 8-10 3-12 24H35l13-28H36v-7Z" fill="#fff"/>
  <text x="24" y="122" fill="#fff" font-family="Segoe UI,Arial" font-size="22" font-weight="700">Seven</text>
  <text x="24" y="146" fill="#C7C1D5" font-family="Segoe UI,Arial" font-size="22">Reader</text>
  <text x="24" y="183" fill="#8D8B95" font-family="Segoe UI,Arial" font-size="8">READ. EDIT. CONVERT.</text>
  <text x="24" y="196" fill="#8D8B95" font-family="Segoe UI,Arial" font-size="8">SIGN. PROTECT.</text>
  <text x="24" y="278" fill="#716E79" font-family="Segoe UI,Arial" font-size="7">LOCAL-FIRST PDF SUITE</text>
</svg>`);
await sharp(sidebar).png().toFile(path.join(installer, "sidebar.png"));

console.log("Seven Reader brand assets generated.");


async function svgToBmp(svgBuffer, width, height, destination) {
  const { data, info } = await sharp(svgBuffer)
    .resize(width, height)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowStride * height;
  const header = Buffer.alloc(54);
  header.write("BM", 0, 2, "ascii");
  header.writeUInt32LE(54 + pixelBytes, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(pixelBytes, 34);

  const pixels = Buffer.alloc(pixelBytes);
  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const src = (sourceY * info.width + x) * info.channels;
      const dst = y * rowStride + x * 3;
      pixels[dst] = data[src + 2];
      pixels[dst + 1] = data[src + 1];
      pixels[dst + 2] = data[src];
    }
  }
  await fs.writeFile(destination, Buffer.concat([header, pixels]));
}

await svgToBmp(header, 150, 57, path.join(installer, "header.bmp"));
await svgToBmp(sidebar, 164, 314, path.join(installer, "sidebar.bmp"));
console.log("Seven Reader NSIS artwork generated.");
