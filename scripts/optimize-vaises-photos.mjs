// Builds the /vaises photos the page actually serves: an AVIF and a smaller JPEG fallback for
// every photo in public/home-photos/vaises-hero, written to its optimized/ subfolder.
// Run after adding or replacing a photo: npm run photos:vaises
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SOURCE_DIR = path.join(process.cwd(), "public", "home-photos", "vaises-hero");
const OUTPUT_DIR = path.join(SOURCE_DIR, "optimized");
const SOURCE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// Full-screen cover photos: on a portrait phone they're scaled by height, so they need close to
// full resolution. Past 2400px wide nothing more is visible under the page's darkening filter.
const MAX_WIDTH = 2400;
// Checked side by side against the originals at 1:1; no visible loss on these photos.
const AVIF_QUALITY = 55;
const JPEG_QUALITY = 80;

async function isUpToDate(source, output) {
  try {
    const [sourceStat, outputStat] = await Promise.all([fs.stat(source), fs.stat(output)]);
    return outputStat.mtimeMs >= sourceStat.mtimeMs;
  } catch {
    return false;
  }
}

async function optimize(fileName) {
  const source = path.join(SOURCE_DIR, fileName);
  const baseName = path.parse(fileName).name;
  const avifOut = path.join(OUTPUT_DIR, `${baseName}.avif`);
  const jpegOut = path.join(OUTPUT_DIR, `${baseName}.jpg`);

  if ((await isUpToDate(source, avifOut)) && (await isUpToDate(source, jpegOut))) {
    console.log(`skip  ${fileName} (up to date)`);
    return;
  }

  const image = sharp(source)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true });
  const [avif, jpeg] = await Promise.all([
    image.clone().avif({ quality: AVIF_QUALITY, effort: 6 }).toFile(avifOut),
    image.clone().jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toFile(jpegOut),
  ]);
  const sourceKb = Math.round((await fs.stat(source)).size / 1024);
  console.log(
    `wrote ${fileName}: ${sourceKb}KB -> avif ${Math.round(avif.size / 1024)}KB, jpg ${Math.round(jpeg.size / 1024)}KB`,
  );
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const entries = await fs.readdir(SOURCE_DIR, { withFileTypes: true });
  // Same base name in two formats (e.g. landing.png and landing.jpg) would write the same
  // outputs twice; the JPEG wins, as the page's own source of truth.
  const byBaseName = new Map();
  for (const entry of entries) {
    const ext = path.extname(entry.name).toLowerCase();
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(ext)) continue;
    const baseName = path.parse(entry.name).name;
    const existing = byBaseName.get(baseName);
    if (!existing || ext === ".jpg" || ext === ".jpeg") byBaseName.set(baseName, entry.name);
  }
  for (const fileName of byBaseName.values()) {
    await optimize(fileName);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
