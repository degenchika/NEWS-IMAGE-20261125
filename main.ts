// Entry point for the 25 November world-news image bounty.
//
// The artwork itself already exists as entry.png next to this file.
// All this script does is carry that file, unchanged, into the
// directory the bounty kit expects, with a few safety checks on the
// way: the file has to be there, it has to be a reasonably small PNG
// (or JPEG), and the copy that lands in the output folder has to be
// byte-identical to the source. Nothing is generated, fetched, or
// transformed here, and the output folder itself is never removed.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// One mebibyte is the largest image the bounty will accept.
const SIZE_LIMIT = 1024 * 1024;

// First bytes of the two image formats we are willing to publish.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

const IMAGE_FILE = "entry.png";
const STAGING_FILE = "entry.png.tmp";

// Print a message on stderr and stop with a failure status.
function abort(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

// Where should the published image go? The kit sets
// MAKEFUN_OUTPUT_DIR; without it we fall back to ./out.
function outputDirectory(): string {
  const configured = process.env.MAKEFUN_OUTPUT_DIR;
  if (configured !== undefined && configured !== "") {
    return configured;
  }
  return "./out";
}

// The artwork lives in the same folder as this script, wherever the
// repository happens to be checked out.
function sourceImagePath(): string {
  return fileURLToPath(new URL(`./${IMAGE_FILE}`, import.meta.url));
}

// Load the artwork, complaining clearly if it is not there.
async function loadSource(path: string): Promise<Buffer> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    abort(`cannot read ${IMAGE_FILE} at ${path}`);
  }
  return bytes;
}

// Reject anything oversized or anything that is not a PNG/JPEG.
function checkImage(bytes: Buffer, path: string): void {
  if (bytes.length > SIZE_LIMIT) {
    abort(
      `${IMAGE_FILE} is ${bytes.length} bytes, over the ${SIZE_LIMIT} byte limit`,
    );
  }
  const looksPng = bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
  const looksJpeg = bytes.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC);
  if (!looksPng && !looksJpeg) {
    abort(`${path} is not a PNG or JPEG image`);
  }
}

// Write to a staging file first, then rename it over the destination
// in one step, so a half-written image can never be observed by the
// kit (the rename stays on the same filesystem, so it is atomic).
async function publish(bytes: Buffer, directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const target = join(directory, IMAGE_FILE);
  const staging = join(directory, STAGING_FILE);
  await writeFile(staging, bytes);
  await rename(staging, target);
  return target;
}

// Read the published file back and make sure every byte matches.
async function confirmPublished(target: string, expected: Buffer): Promise<void> {
  let published: Buffer;
  try {
    published = await readFile(target);
  } catch {
    abort(`could not read back published image at ${target}`);
  }
  if (!published.equals(expected)) {
    abort(`published image at ${target} does not match ${IMAGE_FILE}`);
  }
}

async function main(): Promise<void> {
  const sourcePath = sourceImagePath();
  const bytes = await loadSource(sourcePath);
  checkImage(bytes, sourcePath);

  const directory = outputDirectory();
  const target = await publish(bytes, directory);
  await confirmPublished(target, bytes);

  console.log(`wrote ${target} (${bytes.length} bytes)`);
}

await main();
