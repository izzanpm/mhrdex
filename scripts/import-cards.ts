import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  importCatalog,
  parseCatalog,
  prepareCardImages,
  sanitizeErrorMessage,
} from "./cards-import";

async function main() {
  const inputPath = process.argv[2] ?? "cards.en.json";
  const catalog = parseCatalog(JSON.parse(await readFile(inputPath, "utf8")));
  const imagePaths = await prepareCardImages(
    catalog,
    path.join(process.cwd(), "public", "cards"),
  );
  console.log(JSON.stringify(await importCatalog(catalog, imagePaths)));
}

main().catch((error: unknown) => {
  console.error(sanitizeErrorMessage(error));
  process.exitCode = 1;
});
