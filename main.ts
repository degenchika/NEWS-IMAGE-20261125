// Entry driver for the 25 November news-image bounty: it copies the
// pre-rendered front page (entry.png, sitting next to this file) into
// the output folder the harness mounts, so the judge can look at it.
//
// The harness hands us its output folder as a mounted volume. This
// program therefore only creates directories and files inside that
// folder. It never removes a directory (removing the mount point
// itself would fail with EBUSY), and it never touches the network:
// the image bytes are already in the repository, so both runs of
// this program write exactly the same bytes.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 1024 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

// The folder the harness wants the image in. When the variable is
// unset we fall back to a local ./out folder for a manual run.
function outputDir(): string {
  const envDir = process.env.MAKEFUN_OUTPUT_DIR;
  return envDir !== undefined && envDir !== "" ? envDir : "./out";
}

// The front-page image lives beside this script in the repository.
function entryImagePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "entry.png");
}

// Load the image, failing loudly when it is missing from the repo.
function loadImage(imagePath: string): Buffer {
  if (!existsSync(imagePath)) {
    console.error(`entry image not found at ${imagePath}`);
    process.exit(1);
  }
  return readFileSync(imagePath);
}

// The bounty caps the image at 1 MiB and wants a whole PNG or JPEG.
// Refuse to ship anything that breaks either rule.
function checkImage(bytes: Buffer): void {
  if (bytes.length > MAX_BYTES) {
    console.error(`entry image is ${bytes.length} bytes, over the 1 MiB limit`);
    process.exit(1);
  }
  const head = bytes.subarray(0, 4);
  const isPng = PNG_MAGIC.every((byte, index) => head[index] === byte);
  const isJpeg = JPEG_MAGIC.every((byte, index) => head[index] === byte);
  if (!isPng && !isJpeg) {
    console.error("entry image starts with neither PNG nor JPEG magic bytes");
    process.exit(1);
  }
}

// Write the image atomically: bytes first go to a temporary file in
// the same folder, then are renamed over the target, so a reader
// never catches a half-written entry.png. The rename stays on the
// same filesystem, so it is a single atomic step. verifyPublished
// below re-reads the published copy and compares it byte for byte
// with the source, so both harness runs must produce identical bytes.
function publishImage(bytes: Buffer, dir: string): string {
  mkdirSync(dir, { recursive: true });
  const target = join(dir, "entry.png");
  const staging = join(dir, "entry.png.tmp");
  writeFileSync(staging, bytes);
  renameSync(staging, target);
  return target;
}

// Read the published copy back and compare it byte for byte with
// the source. A short or stale write must fail here, never reach
// the judge.
function verifyPublished(source: Buffer, target: string): void {
  const published = readFileSync(target);
  if (!published.equals(source)) {
    console.error(`published copy at ${target} differs from the entry image`);
    process.exit(1);
  }
}

function main(): void {
  const image = loadImage(entryImagePath());
  checkImage(image);
  const dir = outputDir();
  const target = publishImage(image, dir);
  verifyPublished(image, target);
  console.log(`wrote ${target} (${image.length} bytes)`);
}

main();
