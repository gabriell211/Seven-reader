import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = process.cwd();
const brandPath = path.join(root, "public", "seven-reader-brand.webp");
const out = path.join(root, "src-tauri", "icons");
const installer = path.join(root, "src-tauri", "installer");

await fs.mkdir(out, { recursive: true });
await fs.mkdir(installer, { recursive: true });

const brand = await fs.readFile(brandPath);
const sizes = [32, 128, 256, 512];

for (const size of sizes) {
  await sharp(brand)
    .resize(size, size, { fit: "contain" })
    .png()
    .toFile(path.join(out, `${size}x${size}.png`));
}

await sharp(brand).resize(256, 256, { fit: "contain" }).png().toFile(path.join(out, "128x128@2x.png"));
await sharp(brand).resize(512, 512, { fit: "contain" }).png().toFile(path.join(out, "icon.png"));

const ico = await pngToIco([
  path.join(out, "32x32.png"),
  path.join(out, "128x128.png"),
  path.join(out, "256x256.png"),
]);
await fs.writeFile(path.join(out, "icon.ico"), ico);

const headerBase = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#101217"/>
      <stop offset="1" stop-color="#1E1830"/>
    </linearGradient>
  </defs>
  <rect width="150" height="57" fill="url(#bg)"/>
  <text x="58" y="27" fill="#FFFFFF" font-family="Segoe UI,Arial" font-size="15" font-weight="700">Seven Reader</text>
  <text x="58" y="42" fill="#AAA5B8" font-family="Segoe UI,Arial" font-size="8">READ · EDIT · CONVERT</text>
</svg>`);

const headerLogo = await sharp(brand).resize(40, 40, { fit: "contain" }).png().toBuffer();
const header = await sharp(headerBase)
  .composite([{ input: headerLogo, left: 9, top: 8 }])
  .png()
  .toBuffer();
await fs.writeFile(path.join(installer, "header.png"), header);

const sidebarBase = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#101217"/>
      <stop offset="1" stop-color="#251B3B"/>
    </linearGradient>
  </defs>
  <rect width="164" height="314" fill="url(#bg)"/>
  <circle cx="144" cy="28" r="96" fill="#7043EF" opacity=".16"/>
  <text x="24" y="126" fill="#FFFFFF" font-family="Segoe UI,Arial" font-size="22" font-weight="700">Seven</text>
  <text x="24" y="150" fill="#CBC6D7" font-family="Segoe UI,Arial" font-size="22">Reader</text>
  <text x="24" y="187" fill="#918D9A" font-family="Segoe UI,Arial" font-size="8">READ. EDIT. CONVERT.</text>
  <text x="24" y="200" fill="#918D9A" font-family="Segoe UI,Arial" font-size="8">SIGN. PROTECT.</text>
  <text x="24" y="278" fill="#77727F" font-family="Segoe UI,Arial" font-size="7">LOCAL-FIRST PDF SUITE</text>
</svg>`);

const sidebarLogo = await sharp(brand).resize(66, 66, { fit: "contain" }).png().toBuffer();
const sidebar = await sharp(sidebarBase)
  .composite([{ input: sidebarLogo, left: 20, top: 30 }])
  .png()
  .toBuffer();
await fs.writeFile(path.join(installer, "sidebar.png"), sidebar);

async function imageToBmp(imageBuffer, width, height, destination) {
  const { data, info } = await sharp(imageBuffer)
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

await imageToBmp(header, 150, 57, path.join(installer, "header.bmp"));
await imageToBmp(sidebar, 164, 314, path.join(installer, "sidebar.bmp"));

console.log("Seven Reader assets generated from the official brand logo.");
