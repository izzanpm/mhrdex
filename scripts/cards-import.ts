import { eq, sql } from "drizzle-orm";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  cards,
  cardSets,
  cardTraits,
  cardVariants,
  traits,
} from "../src/db/schema";

const COLOR_CODES = new Set([
  "blue",
  "red",
  "yellow",
  "green",
  "purple",
  "orange",
]);
const RARITY_CODES = new Set([
  "ER",
  "GR",
  "MR",
  "PR",
  "R",
  "SEC",
  "SR",
  "TR",
  "UR",
]);
const IMAGE_EXTENSIONS = ["jpg", "png", "webp"] as const;
const MIN_INT32 = -2_147_483_648;
const MAX_INT32 = 2_147_483_647;

export type ScrapedVariant = {
  rarityCode: string;
  level: number;
  power: number | null;
  range: number | null;
  imageUrl: string;
  sourcePageUrl: string;
};

export type ScrapedCard = {
  cardCode: string;
  name: string;
  colorCode: string;
  setCode: string;
  cardType: string;
  traits: string[];
  abilityText: string | null;
  flavorText: string | null;
  variants: ScrapedVariant[];
};

export type ScrapedCatalog = {
  schemaVersion: 2;
  language: "en";
  sourceUrl: string;
  scrapedAt: string;
  cards: ScrapedCard[];
};

export type ImportCounts = {
  cards: number;
  variants: number;
  sets: number;
  traits: number;
  cardTraits: number;
};

export function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown import error";
  return message
    .replace(/(https?:\/\/[^\s?]+)\?\S*/gi, "$1")
    .replace(/\b(token|signature|sig|key)=\S+/gi, "$1=[redacted]");
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a nonempty string`);
  }
  return value;
}

function asciiIdentifier(value: unknown, field: string): string {
  const text = string(value, field);
  if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(text)) {
    throw new Error(`${field} must be an ASCII identifier`);
  }
  return text;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string or null`);
  return value;
}

function integer(value: unknown, field: string): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < MIN_INT32 ||
    (value as number) > MAX_INT32
  ) {
    throw new Error(`${field} must be a signed 32-bit integer`);
  }
  return value as number;
}

function nullableInteger(value: unknown, field: string): number | null {
  if (value === null) return null;
  return integer(value, field);
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a nonempty array`);
  }
  return value;
}

function httpUrl(value: unknown, field: string): string {
  const urlValue = string(value, field);
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error(`${field} must be an HTTP(S) URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${field} must be an HTTP(S) URL`);
  }
  return urlValue;
}

export function parseCatalog(value: unknown): ScrapedCatalog {
  const root = object(value, "catalog");
  if (root.schema_version !== 2) throw new Error("schema_version must be 2");
  if (root.language !== "en") throw new Error('language must be "en"');

  const seenCards = new Set<string>();
  const cardsValue = array(root.cards, "cards").map((cardValue, cardIndex) => {
    const input = object(cardValue, `cards[${cardIndex}]`);
    const prefix = `cards[${cardIndex}]`;
    const cardCode = asciiIdentifier(
      input.card_code,
      `${prefix}.card_code`,
    ).toUpperCase();
    if (seenCards.has(cardCode)) {
      throw new Error(`duplicate card key: ${cardCode}`);
    }
    seenCards.add(cardCode);

    const rawColorCode = string(input.color_code, `${prefix}.color_code`);
    if (!/^[A-Za-z]+$/.test(rawColorCode)) {
      throw new Error(`${prefix}.color_code must contain only ASCII letters`);
    }
    const colorCode = rawColorCode.toLowerCase();
    if (!COLOR_CODES.has(colorCode)) throw new Error(`${prefix}.color_code is unknown`);
    const setCode = asciiIdentifier(
      input.set_code,
      `${prefix}.set_code`,
    ).toUpperCase();

    const traitNames = array(input.traits, `${prefix}.traits`).map((trait, index) =>
      string(trait, `${prefix}.traits[${index}]`),
    );
    if (new Set(traitNames).size !== traitNames.length) {
      throw new Error(`${prefix}.traits contains a duplicate`);
    }

    const seenVariants = new Set<string>();
    const variants = array(input.variants, `${prefix}.variants`).map(
      (variantValue, variantIndex) => {
        const variant = object(
          variantValue,
          `${prefix}.variants[${variantIndex}]`,
        );
        const variantPrefix = `${prefix}.variants[${variantIndex}]`;
        const rarityCode = asciiIdentifier(
          variant.rarity_code,
          `${variantPrefix}.rarity_code`,
        ).toUpperCase();
        const variantKey = `${cardCode}|${rarityCode}`;
        if (seenVariants.has(variantKey)) {
          throw new Error(`duplicate variant key: ${variantKey}`);
        }
        seenVariants.add(variantKey);
        if (!RARITY_CODES.has(rarityCode)) {
          throw new Error(`${variantPrefix}.rarity_code is unknown`);
        }

        const level = integer(variant.level, `${variantPrefix}.level`);
        if (level < 1 || level > 6) {
          throw new Error(`${variantPrefix}.level must be between 1 and 6`);
        }

        return {
          rarityCode,
          level,
          power: nullableInteger(variant.power, `${variantPrefix}.power`),
          range: nullableInteger(variant.range, `${variantPrefix}.range`),
          imageUrl: httpUrl(variant.image_url, `${variantPrefix}.image_url`),
          sourcePageUrl: httpUrl(
            variant.source_page_url,
            `${variantPrefix}.source_page_url`,
          ),
        };
      },
    );

    return {
      cardCode,
      name: string(input.name, `${prefix}.name`),
      colorCode,
      setCode,
      cardType: string(input.card_type, `${prefix}.card_type`),
      traits: traitNames,
      abilityText: nullableString(input.ability_text, `${prefix}.ability_text`),
      flavorText: nullableString(input.flavor_text, `${prefix}.flavor_text`),
      variants,
    };
  });

  return {
    schemaVersion: 2,
    language: "en",
    sourceUrl: httpUrl(root.source_url, "source_url"),
    scrapedAt: string(root.scraped_at, "scraped_at"),
    cards: cardsValue,
  };
}

export function getVariantImageName(
  cardCode: string,
  rarityCode: string,
  contentType: string,
): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(cardCode)) {
    throw new Error("unsafe card code for image filename");
  }
  if (!/^[a-z0-9]+$/i.test(rarityCode)) {
    throw new Error("unsafe rarity code for image filename");
  }

  const normalizedType = contentType.split(";", 1)[0].trim().toLowerCase();
  const extension =
    normalizedType === "image/jpeg"
      ? "jpg"
      : normalizedType === "image/png"
        ? "png"
        : normalizedType === "image/webp"
          ? "webp"
          : null;
  if (extension === null) throw new Error("unsupported image content type");

  return `${cardCode.toLowerCase()}-${rarityCode.toLowerCase()}.${extension}`;
}

function isJpeg(bytes: Uint8Array): boolean {
  const buffer = Buffer.from(bytes);
  if (
    buffer.length < 8 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8
  ) {
    return false;
  }

  let hasSof = false;
  let hasSos = false;
  let hasEntropy = false;
  const components = new Set<number>();
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) return false;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) return false;
    const marker = buffer[offset++];
    if (marker === 0xd9) {
      return hasSof && hasSos && hasEntropy && offset === buffer.length;
    }
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      return false;
    }
    if (marker === 0x01) continue;
    if (offset + 2 > buffer.length) return false;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || length > buffer.length - offset) return false;
    const segmentEnd = offset + length;
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      const componentCount = length >= 8 ? buffer[offset + 7] : 0;
      if (
        componentCount === 0 ||
        length !== 8 + 3 * componentCount ||
        buffer.readUInt16BE(offset + 3) === 0 ||
        buffer.readUInt16BE(offset + 5) === 0
      ) {
        return false;
      }
      components.clear();
      for (let index = 0; index < componentCount; index += 1) {
        const id = buffer[offset + 8 + 3 * index];
        if (components.has(id)) return false;
        components.add(id);
      }
      hasSof = true;
    }
    if (marker === 0xda) {
      const componentCount = length >= 6 ? buffer[offset + 2] : 0;
      if (!hasSof || componentCount === 0 || length !== 6 + 2 * componentCount) {
        return false;
      }
      const scanComponents = new Set<number>();
      for (let index = 0; index < componentCount; index += 1) {
        const id = buffer[offset + 3 + 2 * index];
        const tables = buffer[offset + 4 + 2 * index];
        if (
          !components.has(id) ||
          scanComponents.has(id) ||
          (tables >> 4) > 3 ||
          (tables & 0x0f) > 3
        ) {
          return false;
        }
        scanComponents.add(id);
      }
      const spectralOffset = offset + 3 + 2 * componentCount;
      if (
        buffer[spectralOffset] > 63 ||
        buffer[spectralOffset + 1] > 63 ||
        buffer[spectralOffset] > buffer[spectralOffset + 1] ||
        (buffer[spectralOffset + 2] >> 4) > 13 ||
        (buffer[spectralOffset + 2] & 0x0f) > 13
      ) {
        return false;
      }
      hasSos = true;
      offset = segmentEnd;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) {
          hasEntropy = true;
          offset += 1;
          continue;
        }
        const markerOffset = offset;
        while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
        if (offset >= buffer.length) return false;
        const scanMarker = buffer[offset];
        if (scanMarker === 0x00) {
          hasEntropy = true;
          offset += 1;
        } else if (scanMarker >= 0xd0 && scanMarker <= 0xd7) {
          offset += 1;
        } else {
          offset = markerOffset;
          break;
        }
      }
      continue;
    }
    offset = segmentEnd;
  }

  return false;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isPng(bytes: Uint8Array): boolean {
  const buffer = Buffer.from(bytes);
  if (
    buffer.length < 45 ||
    !buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  ) {
    return false;
  }

  let offset = 8;
  let chunkIndex = 0;
  let hasIdat = false;
  while (offset < buffer.length) {
    if (buffer.length - offset < 12) return false;
    const length = buffer.readUInt32BE(offset);
    if (length > buffer.length - offset - 12) return false;
    const type = buffer.subarray(offset + 4, offset + 8).toString();
    const dataOffset = offset + 8;
    const nextOffset = offset + 12 + length;
    if (
      crc32(buffer.subarray(offset + 4, dataOffset + length)) !==
      buffer.readUInt32BE(dataOffset + length)
    ) {
      return false;
    }
    if (chunkIndex === 0) {
      const bitDepth = buffer[dataOffset + 8];
      const colorType = buffer[dataOffset + 9];
      const validBitDepths: Record<number, readonly number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        type !== "IHDR" ||
        length !== 13 ||
        buffer.readUInt32BE(dataOffset) === 0 ||
        buffer.readUInt32BE(dataOffset + 4) === 0 ||
        !validBitDepths[colorType]?.includes(bitDepth) ||
        buffer[dataOffset + 10] !== 0 ||
        buffer[dataOffset + 11] !== 0 ||
        buffer[dataOffset + 12] > 1
      ) {
        return false;
      }
    } else if (type === "IHDR") {
      return false;
    }
    if (type === "IDAT" && length > 0) hasIdat = true;
    if (type === "IEND") {
      return length === 0 && hasIdat && nextOffset === buffer.length;
    }
    offset = nextOffset;
    chunkIndex += 1;
  }
  return false;
}

function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const buffer = Buffer.from(bytes);
  if (
    buffer.subarray(0, 4).toString() !== "RIFF" ||
    buffer.readUInt32LE(4) !== bytes.length - 8 ||
    buffer.subarray(8, 12).toString() !== "WEBP"
  ) {
    return false;
  }

  const validVp8 = (payload: Buffer): boolean =>
    payload.length >= 10 &&
    (payload[0] & 1) === 0 &&
    payload[3] === 0x9d &&
    payload[4] === 0x01 &&
    payload[5] === 0x2a &&
    (payload.readUInt16LE(6) & 0x3fff) > 0 &&
    (payload.readUInt16LE(8) & 0x3fff) > 0;
  const validVp8l = (payload: Buffer): boolean => {
    if (payload.length < 5 || payload[0] !== 0x2f) return false;
    const dimensions = payload.readUInt32LE(1);
    const width = (dimensions & 0x3fff) + 1;
    const height = ((dimensions >>> 14) & 0x3fff) + 1;
    return width > 0 && height > 0 && (dimensions >>> 29) === 0;
  };
  const validAnmf = (payload: Buffer): boolean => {
    if (
      payload.length < 24 ||
      payload.readUIntLE(6, 3) + 1 <= 0 ||
      payload.readUIntLE(9, 3) + 1 <= 0 ||
      (payload[15] & 0xfc) !== 0
    ) {
      return false;
    }
    let frameOffset = 16;
    let hasImage = false;
    while (frameOffset < payload.length) {
      if (payload.length - frameOffset < 8) return false;
      const type = payload.subarray(frameOffset, frameOffset + 4).toString();
      const length = payload.readUInt32LE(frameOffset + 4);
      const dataOffset = frameOffset + 8;
      const nextOffset = dataOffset + length + (length % 2);
      if (nextOffset > payload.length || (length % 2 === 1 && payload[nextOffset - 1] !== 0)) {
        return false;
      }
      const data = payload.subarray(dataOffset, dataOffset + length);
      if (type === "VP8 ") hasImage = validVp8(data);
      if (type === "VP8L") hasImage = validVp8l(data);
      frameOffset = nextOffset;
    }
    return hasImage && frameOffset === payload.length;
  };

  let offset = 12;
  let chunkIndex = 0;
  let extended = false;
  let animated = false;
  let hasImage = false;
  let hasFrame = false;
  while (offset < buffer.length) {
    if (buffer.length - offset < 8) return false;
    const type = buffer.subarray(offset, offset + 4).toString();
    const length = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + length + (length % 2);
    if (nextOffset > buffer.length || (length % 2 === 1 && buffer[nextOffset - 1] !== 0)) {
      return false;
    }
    const payload = buffer.subarray(dataOffset, dataOffset + length);
    if (chunkIndex === 0) {
      if (type === "VP8 ") hasImage = validVp8(payload);
      else if (type === "VP8L") hasImage = validVp8l(payload);
      else if (type === "VP8X") {
        const width = payload.length === 10 ? payload.readUIntLE(4, 3) + 1 : 0;
        const height = payload.length === 10 ? payload.readUIntLE(7, 3) + 1 : 0;
        if (
          payload.length !== 10 ||
          width <= 0 ||
          height <= 0 ||
          (payload[0] & 0xc1) !== 0 ||
          payload[1] !== 0 ||
          payload[2] !== 0 ||
          payload[3] !== 0
        ) {
          return false;
        }
        extended = true;
        animated = (payload[0] & 0x02) !== 0;
      } else {
        return false;
      }
    } else if (type === "VP8 ") {
      if (!validVp8(payload)) return false;
      hasImage = true;
    } else if (type === "VP8L") {
      if (!validVp8l(payload)) return false;
      hasImage = true;
    } else if (type === "ANMF") {
      if (!validAnmf(payload)) return false;
      hasFrame = true;
    }
    offset = nextOffset;
    chunkIndex += 1;
  }
  return (
    offset === buffer.length &&
    chunkIndex > 0 &&
    (extended ? (animated ? hasFrame : hasImage) : hasImage)
  );
}

function hasImageSignature(
  bytes: Uint8Array,
  extension: (typeof IMAGE_EXTENSIONS)[number],
): boolean {
  return extension === "jpg"
    ? isJpeg(bytes)
    : extension === "png"
      ? isPng(bytes)
      : isWebp(bytes);
}

async function existingImage(
  outputDirectory: string,
  cardCode: string,
  rarityCode: string,
): Promise<string | null> {
  const stem = `${cardCode.toLowerCase()}-${rarityCode.toLowerCase()}`;
  for (const extension of IMAGE_EXTENSIONS) {
    const filename = `${stem}.${extension}`;
    const filePath = path.join(outputDirectory, filename);
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) continue;
      if (fileStat.size > 0 && hasImageSignature(await readFile(filePath), extension)) {
        return filename;
      }
      await rm(filePath, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return null;
}

async function prepareImage(
  variant: ScrapedVariant,
  cardCode: string,
  outputDirectory: string,
): Promise<[string, string]> {
  const key = `${cardCode}|${variant.rarityCode}`;
  const reused = await existingImage(outputDirectory, cardCode, variant.rarityCode);
  if (reused !== null) return [key, `/cards/${reused}`];

  let response: Response;
  try {
    response = await fetch(variant.imageUrl);
  } catch {
    throw new Error(`failed to download image for ${key}`);
  }
  if (!response.ok) {
    throw new Error(`image download failed for ${key} with status ${response.status}`);
  }

  const filename = getVariantImageName(
    cardCode,
    variant.rarityCode,
    response.headers.get("content-type") ?? "",
  );
  const finalPath = path.join(outputDirectory, filename);
  const temporaryPath = `${finalPath}.tmp`;
  try {
    const bytes = Buffer.from(await response.arrayBuffer());
    const extension = path.extname(filename).slice(1) as (typeof IMAGE_EXTENSIONS)[number];
    if (!hasImageSignature(bytes, extension)) {
      throw new Error(`invalid image content for ${key}`);
    }
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, finalPath);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid image content")) {
      throw error;
    }
    throw new Error(`failed to save image for ${key}`);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return [key, `/cards/${filename}`];
}

export async function prepareCardImages(
  catalog: ScrapedCatalog,
  outputDirectory: string,
): Promise<Map<string, string>> {
  await mkdir(outputDirectory, { recursive: true });
  const work = catalog.cards.flatMap((card) =>
    card.variants.map((variant) => ({ cardCode: card.cardCode, variant })),
  );
  const imagePaths = new Map<string, string>();

  for (let index = 0; index < work.length; index += 8) {
    const settled = await Promise.allSettled(
      work
        .slice(index, index + 8)
        .map(({ cardCode, variant }) =>
          prepareImage(variant, cardCode, outputDirectory),
        ),
    );
    const failure = settled.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure !== undefined) throw failure.reason;
    for (const result of settled) {
      if (result.status === "fulfilled") {
        const [key, publicPath] = result.value;
        imagePaths.set(key, publicPath);
      }
    }
  }

  return imagePaths;
}

export async function importCatalog(
  catalog: ScrapedCatalog,
  imagePaths: Map<string, string>,
): Promise<ImportCounts> {
  for (const card of catalog.cards) {
    for (const variant of card.variants) {
      if (!imagePaths.has(`${card.cardCode}|${variant.rarityCode}`)) {
        throw new Error(`missing prepared image for ${card.cardCode}|${variant.rarityCode}`);
      }
    }
  }

  const setCodes = [...new Set(catalog.cards.map((card) => card.setCode))];
  const traitNames = [...new Set(catalog.cards.flatMap((card) => card.traits))];
  const counts: ImportCounts = {
    cards: catalog.cards.length,
    variants: catalog.cards.reduce((sum, card) => sum + card.variants.length, 0),
    sets: setCodes.length,
    traits: traitNames.length,
    cardTraits: catalog.cards.reduce((sum, card) => sum + card.traits.length, 0),
  };
  const { db } = await import("../src/db/client");

  await db.transaction(async (tx) => {
    const setRows = await tx
      .insert(cardSets)
      .values(setCodes.map((code) => ({ code })))
      .onConflictDoUpdate({
        target: cardSets.code,
        set: { code: sql.raw("excluded.code") },
      })
      .returning({ code: cardSets.code, id: cardSets.id });
    const setIds = new Map(setRows.map((row) => [row.code, row.id]));

    const traitRows = await tx
      .insert(traits)
      .values(traitNames.map((name) => ({ name })))
      .onConflictDoUpdate({
        target: traits.name,
        set: { name: sql.raw("excluded.name") },
      })
      .returning({ id: traits.id, name: traits.name });
    const traitIds = new Map(traitRows.map((row) => [row.name, row.id]));

    for (const card of catalog.cards) {
      const setId = setIds.get(card.setCode);
      if (setId === undefined) throw new Error(`missing set row for ${card.setCode}`);

      const [cardRow] = await tx
        .insert(cards)
        .values({
          cardCode: card.cardCode,
          name: card.name,
          colorCode: card.colorCode,
          cardType: card.cardType,
          abilityText: card.abilityText,
          flavorText: card.flavorText,
          setId,
        })
        .onConflictDoUpdate({
          target: cards.cardCode,
          set: {
            name: card.name,
            colorCode: card.colorCode,
            cardType: card.cardType,
            abilityText: card.abilityText,
            flavorText: card.flavorText,
            setId,
            updatedAt: new Date(),
          },
        })
        .returning({ id: cards.id });

      for (const variant of card.variants) {
        await tx
          .insert(cardVariants)
          .values({
            cardId: cardRow.id,
            rarityCode: variant.rarityCode,
            level: variant.level,
            power: variant.power,
            range: variant.range === null ? null : String(variant.range),
            imageUrl: imagePaths.get(`${card.cardCode}|${variant.rarityCode}`)!,
            sourcePageUrl: variant.sourcePageUrl,
          })
          .onConflictDoUpdate({
            target: [cardVariants.cardId, cardVariants.rarityCode],
            set: {
              level: variant.level,
              power: variant.power,
              range: variant.range === null ? null : String(variant.range),
              imageUrl: imagePaths.get(`${card.cardCode}|${variant.rarityCode}`)!,
              sourcePageUrl: variant.sourcePageUrl,
            },
          });
      }

      await tx.delete(cardTraits).where(eq(cardTraits.cardId, cardRow.id));
      await tx
        .insert(cardTraits)
        .values(
          card.traits.map((traitName) => ({
            cardId: cardRow.id,
            traitId: traitIds.get(traitName)!,
          })),
        )
        .onConflictDoNothing({
          target: [cardTraits.cardId, cardTraits.traitId],
        });
    }
  });

  return counts;
}
