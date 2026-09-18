import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach } from "node:test";

import {
  getVariantImageName,
  parseCatalog,
  prepareCardImages,
  sanitizeErrorMessage,
  type ScrapedCatalog,
} from "./cards-import";

const validCatalog = {
  schema_version: 2,
  language: "en",
  source_url: "https://www.marvelherorush.com/en/cards",
  scraped_at: "2026-09-12T16:36:38.330809Z",
  cards: [
    {
      card_code: "BP01-001",
      name: "Iron Man",
      color_code: "red",
      set_code: "BP01",
      card_type: "character",
      traits: ["Human", "Avengers"],
      ability_text: "An ability.",
      flavor_text: null,
      variants: [
        {
          rarity_code: "MR",
          level: 6,
          power: 6500,
          range: 1,
          image_url: "https://images.example/card?token=secret",
          source_page_url: "https://www.marvelherorush.com/en/cards/1",
        },
      ],
    },
  ],
};

const originalFetch = globalThis.fetch;
const jpegSof = [
  255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0,
];
const jpegSos = [255, 218, 0, 8, 1, 1, 0, 0, 63, 0];
const jpegBytes = new Uint8Array([
  255, 216, ...jpegSof, ...jpegSos, 0, 255, 217,
]);
const pngBytes = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);
function webpChunk(type: string, payload: number[]): Buffer {
  const header = Buffer.alloc(8);
  header.write(type, 0, "ascii");
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([
    header,
    Buffer.from(payload),
    ...(payload.length % 2 === 0 ? [] : [Buffer.from([0])]),
  ]);
}

function webp(...chunks: Buffer[]): Uint8Array<ArrayBuffer> {
  const body = Buffer.concat([Buffer.from("WEBP"), ...chunks]);
  const header = Buffer.alloc(8);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(body.length, 4);
  return Uint8Array.from(Buffer.concat([header, body]));
}

const vp8lChunk = webpChunk("VP8L", [47, 0, 0, 0, 0]);
const webpBytes = webp(vp8lChunk);
const vp8Bytes = webp(
  webpChunk("VP8 ", [0, 0, 0, 157, 1, 42, 1, 0, 1, 0]),
);
const vp8xBytes = webp(
  webpChunk("VP8X", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  vp8lChunk,
);
const animatedWebpBytes = webp(
  webpChunk("VP8X", [2, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  webpChunk("ANMF", [...new Array<number>(16).fill(0), ...vp8lChunk]),
);

function setPngIhdrByte(
  bytes: Uint8Array,
  index: number,
  value: number,
): Uint8Array<ArrayBuffer> {
  const changed = Buffer.from(bytes);
  changed[24 + index] = value;
  let crc = 0xffffffff;
  for (const byte of changed.subarray(12, 29)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  changed.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
  return Uint8Array.from(changed);
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("parses a complete supported catalog", () => {
  const catalog = parseCatalog(validCatalog);

  assert.equal(catalog.cards[0].variants[0].rarityCode, "MR");
  assert.equal(catalog.cards[0].abilityText, "An ability.");
});

test("accepts every seeded color", () => {
  for (const color of [
    "blue",
    "red",
    "yellow",
    "green",
    "purple",
    "orange",
  ]) {
    const input = structuredClone(validCatalog);
    input.cards[0].color_code = color;
    assert.equal(parseCatalog(input).cards[0].colorCode, color);
  }
});

test("rejects duplicate card and variant natural keys", () => {
  const duplicateCards = structuredClone(validCatalog);
  duplicateCards.cards.push(structuredClone(duplicateCards.cards[0]));
  assert.throws(() => parseCatalog(duplicateCards), /duplicate card/i);

  const duplicateVariants = structuredClone(validCatalog);
  duplicateVariants.cards[0].variants.push(
    structuredClone(duplicateVariants.cards[0].variants[0]),
  );
  assert.throws(() => parseCatalog(duplicateVariants), /duplicate variant/i);

  const caseDuplicateCards = structuredClone(validCatalog);
  const secondCard = structuredClone(caseDuplicateCards.cards[0]);
  secondCard.card_code = secondCard.card_code.toLowerCase();
  caseDuplicateCards.cards.push(secondCard);
  assert.throws(() => parseCatalog(caseDuplicateCards), /duplicate card/i);

  const caseDuplicateVariants = structuredClone(validCatalog);
  const secondVariant = structuredClone(caseDuplicateVariants.cards[0].variants[0]);
  secondVariant.rarity_code = secondVariant.rarity_code.toLowerCase();
  caseDuplicateVariants.cards[0].variants.push(secondVariant);
  assert.throws(() => parseCatalog(caseDuplicateVariants), /duplicate variant/i);
});

test("rejects unknown colors, rarities, and invalid levels", () => {
  const invalidColor = structuredClone(validCatalog);
  invalidColor.cards[0].color_code = "black";
  assert.throws(() => parseCatalog(invalidColor), /color/i);

  const invalidRarity = structuredClone(validCatalog);
  invalidRarity.cards[0].variants[0].rarity_code = "XR";
  assert.throws(() => parseCatalog(invalidRarity), /rarity/i);

  for (const level of [0, 7, 1.5]) {
    const invalidLevel = structuredClone(validCatalog);
    invalidLevel.cards[0].variants[0].level = level;
    assert.throws(() => parseCatalog(invalidLevel), /level/i);
  }
});

test("rejects integers outside PostgreSQL signed 32-bit range", () => {
  for (const field of ["level", "power", "range"] as const) {
    for (const value of [-2_147_483_649, 2_147_483_648]) {
      const input = structuredClone(validCatalog);
      input.cards[0].variants[0][field] = value;
      assert.throws(() => parseCatalog(input), new RegExp(field, "i"));
    }
  }
});

test("canonicalizes database keys without changing display text", async () => {
  const input = structuredClone(validCatalog);
  input.cards[0].card_code = "bp01-001";
  input.cards[0].set_code = "bP01";
  input.cards[0].color_code = "ReD";
  input.cards[0].variants[0].rarity_code = "mr";
  const catalog = parseCatalog(input);
  const card = catalog.cards[0];

  assert.equal(card.cardCode, "BP01-001");
  assert.equal(card.setCode, "BP01");
  assert.equal(card.colorCode, "red");
  assert.equal(card.variants[0].rarityCode, "MR");
  assert.equal(card.name, "Iron Man");
  assert.deepEqual(card.traits, ["Human", "Avengers"]);
  assert.equal(card.abilityText, "An ability.");

  const outputDirectory = await mkdtemp(path.join(tmpdir(), "mhr-cards-"));
  globalThis.fetch = async () =>
    new Response(webpBytes, {
      headers: { "content-type": "image/webp" },
    });
  const paths = await prepareCardImages(catalog, outputDirectory);
  assert.equal(paths.get("BP01-001|MR"), "/cards/bp01-001-mr.webp");
});

test("rejects non-ASCII identifiers before canonicalization", () => {
  const invalidCard = structuredClone(validCatalog);
  invalidCard.cards[0].card_code = "BP01-00ſ";
  assert.throws(() => parseCatalog(invalidCard), /card_code/i);

  const invalidSet = structuredClone(validCatalog);
  invalidSet.cards[0].set_code = "ß";
  assert.throws(() => parseCatalog(invalidSet), /set_code/i);

  const invalidRarity = structuredClone(validCatalog);
  invalidRarity.cards[0].variants[0].rarity_code = "ſr";
  assert.throws(() => parseCatalog(invalidRarity), /rarity_code/i);

  const invalidColor = structuredClone(validCatalog);
  invalidColor.cards[0].color_code = "rеd";
  assert.throws(() => parseCatalog(invalidColor), /color_code/i);
});

test("rejects malformed required, collection, and URL values", () => {
  const emptyTraits = structuredClone(validCatalog);
  emptyTraits.cards[0].traits = [];
  assert.throws(() => parseCatalog(emptyTraits), /traits/i);

  const emptyVariants = structuredClone(validCatalog);
  emptyVariants.cards[0].variants = [];
  assert.throws(() => parseCatalog(emptyVariants), /variants/i);

  const invalidUrl = structuredClone(validCatalog);
  invalidUrl.cards[0].variants[0].image_url = "file:///private/card.webp";
  assert.throws(() => parseCatalog(invalidUrl), /image_url/i);

  const invalidNullableText = structuredClone(validCatalog);
  invalidNullableText.cards[0].ability_text = 42 as unknown as string;
  assert.throws(() => parseCatalog(invalidNullableText), /ability_text/i);

  const unsafeCardCode = structuredClone(validCatalog);
  unsafeCardCode.cards[0].card_code = "../card?token=secret";
  assert.throws(
    () => parseCatalog(unsafeCardCode),
    (error: unknown) => {
      assert(error instanceof Error);
      assert.match(error.message, /card_code/i);
      assert.doesNotMatch(error.message, /token|secret|\?/i);
      return true;
    },
  );
});

test("derives deterministic safe image filenames", () => {
  assert.equal(
    getVariantImageName("BP01-001", "MR", "image/webp"),
    "bp01-001-mr.webp",
  );
  assert.equal(
    getVariantImageName("BP01-001", "MR", "image/jpeg"),
    "bp01-001-mr.jpg",
  );
  assert.throws(
    () => getVariantImageName("BP01-001", "MR", "text/html"),
    /unsupported image content type/i,
  );
  assert.throws(
    () => getVariantImageName("../card", "MR", "image/png"),
    /unsafe card code/i,
  );
});

test("removes signed query and token values from CLI errors", () => {
  const message = sanitizeErrorMessage(
    new Error(
      "failed https://images.example/card.webp?token=secret&signature=signed token=loose",
    ),
  );
  assert.equal(message, "failed https://images.example/card.webp token=[redacted]");
});

test("downloads an image atomically and returns its public path", async () => {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), "mhr-cards-"));
  globalThis.fetch = async () =>
    new Response(jpegBytes, {
      headers: { "content-type": "image/jpeg" },
    });

  const paths = await prepareCardImages(
    parseCatalog(validCatalog),
    outputDirectory,
  );

  assert.equal(paths.get("BP01-001|MR"), "/cards/bp01-001-mr.jpg");
  assert.deepEqual(
    await readFile(path.join(outputDirectory, "bp01-001-mr.jpg")),
    Buffer.from(jpegBytes),
  );
  assert.deepEqual(await readdir(outputDirectory), ["bp01-001-mr.jpg"]);
});

test("reuses an existing nonempty deterministic image", async () => {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), "mhr-cards-"));
  await writeFile(path.join(outputDirectory, "bp01-001-mr.png"), pngBytes);
  globalThis.fetch = async () => {
    throw new Error("fetch should not run");
  };

  const paths = await prepareCardImages(
    parseCatalog(validCatalog),
    outputDirectory,
  );

  assert.equal(paths.get("BP01-001|MR"), "/cards/bp01-001-mr.png");
});

test("limits image downloads to batches of eight", async () => {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), "mhr-cards-"));
  const rarityCodes = ["ER", "GR", "MR", "PR", "R", "SEC", "SR", "TR", "UR"];
  const catalog: ScrapedCatalog = {
    ...parseCatalog(validCatalog),
    cards: [
      {
        ...parseCatalog(validCatalog).cards[0],
        variants: rarityCodes.map((rarityCode) => ({
          ...parseCatalog(validCatalog).cards[0].variants[0],
          rarityCode,
        })),
      },
    ],
  };
  let active = 0;
  let maximumActive = 0;
  globalThis.fetch = async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return new Response(pngBytes, {
      headers: { "content-type": "image/png" },
    });
  };

  await prepareCardImages(catalog, outputDirectory);

  assert.equal(maximumActive, 8);
});

test("rejects empty, malformed, and mismatched image content", async () => {
  for (const [bytes, contentType] of [
    [new Uint8Array(), "image/png"],
    [new Uint8Array([1, 2, 3]), "image/jpeg"],
    [new Uint8Array([1, 2, 3]), "image/webp"],
    [pngBytes, "image/webp"],
  ] as const) {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "mhr-cards-"));
    globalThis.fetch = async () =>
      new Response(bytes, { headers: { "content-type": contentType } });

    await assert.rejects(
      () => prepareCardImages(parseCatalog(validCatalog), outputDirectory),
      /invalid image content/i,
    );
    assert.deepEqual(await readdir(outputDirectory), []);
  }
});

test("rejects truncated JPEG, PNG, and WebP containers", async () => {
  for (const [bytes, contentType] of [
    [new Uint8Array([255, 216, 255]), "image/jpeg"],
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"],
    [
      new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
      "image/webp",
    ],
  ] as const) {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "mhr-cards-"));
    globalThis.fetch = async () =>
      new Response(bytes, { headers: { "content-type": contentType } });

    await assert.rejects(
      () => prepareCardImages(parseCatalog(validCatalog), outputDirectory),
      /invalid image content/i,
    );
    assert.deepEqual(await readdir(outputDirectory), []);
  }
});

test("rejects structurally invalid JPEG containers", async () => {
  const zeroWidth = jpegBytes.slice();
  zeroWidth.set([0, 0], 9);
  for (const bytes of [
    new Uint8Array([255, 216, ...jpegSos, 255, 217]),
    new Uint8Array([255, 216, ...jpegSof, 255, 217]),
    new Uint8Array([255, 216, ...jpegSof, ...jpegSos, 255, 217]),
    new Uint8Array([
      255, 216, ...jpegSof,
      255, 218, 0, 7, 1, 1, 0, 0, 63,
      0, 255, 217,
    ]),
    new Uint8Array([
      255, 216, ...jpegSof,
      255, 218, 0, 8, 1, 1, 0, 63, 0, 0,
      0, 255, 217,
    ]),
    new Uint8Array([255, 216, 255, 224, 255, 255, 255, 217]),
    new Uint8Array([
      255, 216,
      255, 192, 0, 8, 8, 0, 1, 0, 1, 1,
      ...jpegSos,
      255, 217,
    ]),
    zeroWidth,
  ]) {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "mhr-cards-"));
    globalThis.fetch = async () =>
      new Response(bytes, { headers: { "content-type": "image/jpeg" } });
    await assert.rejects(
      () => prepareCardImages(parseCatalog(validCatalog), outputDirectory),
      /invalid image content/i,
    );
  }
});

test("rejects structurally invalid PNG containers", async () => {
  const signature = pngBytes.subarray(0, 8);
  const ihdrEnd = 33;
  const iendStart = pngBytes.length - 12;
  const impossibleLength = new Uint8Array([
    ...signature,
    255, 255, 255, 255, 73, 72, 68, 82,
    ...pngBytes.subarray(iendStart),
  ]);
  const zeroWidth = pngBytes.slice();
  zeroWidth.set([0, 0, 0, 0], 16);
  const badCrc = pngBytes.slice();
  badCrc[32] ^= 1;
  for (const bytes of [
    new Uint8Array([...signature, ...pngBytes.subarray(ihdrEnd)]),
    new Uint8Array([
      ...pngBytes.subarray(0, ihdrEnd),
      ...pngBytes.subarray(iendStart),
    ]),
    impossibleLength,
    zeroWidth,
    badCrc,
    setPngIhdrByte(pngBytes, 0, 3),
    setPngIhdrByte(pngBytes, 1, 1),
    setPngIhdrByte(pngBytes, 2, 1),
    setPngIhdrByte(pngBytes, 3, 2),
    setPngIhdrByte(pngBytes, 4, 2),
  ]) {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "mhr-cards-"));
    globalThis.fetch = async () =>
      new Response(bytes, { headers: { "content-type": "image/png" } });
    await assert.rejects(
      () => prepareCardImages(parseCatalog(validCatalog), outputDirectory),
      /invalid image content/i,
    );
  }
});

test("rejects unsupported and impossible WebP chunks", async () => {
  const unsupported = webpBytes.slice();
  unsupported.set([74, 85, 78, 75], 12);
  const impossibleLength = new Uint8Array([
    82, 73, 70, 70, 16, 0, 0, 0, 87, 69, 66, 80,
    86, 80, 56, 76, 1, 0, 0, 0, 47, 0, 0, 0,
  ]);
  const emptyChunk = new Uint8Array([
    82, 73, 70, 70, 12, 0, 0, 0, 87, 69, 66, 80,
    86, 80, 56, 76, 0, 0, 0, 0,
  ]);
  const zeroDimensionVp8 = webp(
    webpChunk("VP8 ", [0, 0, 0, 157, 1, 42, 0, 0, 1, 0]),
  );
  const badVp8StartCode = webp(
    webpChunk("VP8 ", [0, 0, 0, 0, 1, 42, 1, 0, 1, 0]),
  );
  const badVp8lVersion = webp(webpChunk("VP8L", [47, 0, 0, 0, 128]));
  const shortVp8x = webp(webpChunk("VP8X", [0]));
  const vp8xWithoutImage = webp(
    webpChunk("VP8X", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  );
  const animatedVp8xWithoutFrame = webp(
    webpChunk("VP8X", [2, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    vp8lChunk,
  );
  const truncatedAnmf = webp(
    webpChunk("VP8X", [2, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    webpChunk("ANMF", [0]),
  );
  const trailingByte = new Uint8Array([...webpBytes, 0]);
  for (const bytes of [
    unsupported,
    impossibleLength,
    emptyChunk,
    zeroDimensionVp8,
    badVp8StartCode,
    badVp8lVersion,
    shortVp8x,
    vp8xWithoutImage,
    animatedVp8xWithoutFrame,
    truncatedAnmf,
    trailingByte,
  ]) {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "mhr-cards-"));
    globalThis.fetch = async () =>
      new Response(bytes, { headers: { "content-type": "image/webp" } });
    await assert.rejects(
      () => prepareCardImages(parseCatalog(validCatalog), outputDirectory),
      /invalid image content/i,
    );
  }
});

test("accepts structurally valid WebP image and extended containers", async () => {
  for (const bytes of [vp8Bytes, webpBytes, vp8xBytes, animatedWebpBytes]) {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "mhr-cards-"));
    globalThis.fetch = async () =>
      new Response(bytes, { headers: { "content-type": "image/webp" } });
    const paths = await prepareCardImages(
      parseCatalog(validCatalog),
      outputDirectory,
    );
    assert.equal(paths.get("BP01-001|MR"), "/cards/bp01-001-mr.webp");
  }
});

test("waits for every operation in a failed batch before rejecting", async () => {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), "mhr-cards-"));
  const catalog = parseCatalog(validCatalog);
  catalog.cards[0].variants.push({
    ...catalog.cards[0].variants[0],
    rarityCode: "PR",
    imageUrl: "https://images.example/slow",
  });
  let slowDownloadSettled = false;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/slow")) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      slowDownloadSettled = true;
      return new Response(pngBytes, {
        headers: { "content-type": "image/png" },
      });
    }
    return new Response(null, { status: 500 });
  };

  await assert.rejects(
    () => prepareCardImages(catalog, outputDirectory),
    /BP01-001\|MR.*500/i,
  );
  assert.equal(slowDownloadSettled, true);
});

test("removes a real temporary file when publishing fails", async () => {
  const parentDirectory = await mkdtemp(path.join(tmpdir(), "mhr-cards-"));
  const outputDirectory = path.join(parentDirectory, "cards");
  await mkdir(outputDirectory);
  await mkdir(path.join(outputDirectory, "bp01-001-mr.webp"));
  globalThis.fetch = async () =>
    new Response(webpBytes, {
      headers: { "content-type": "image/webp" },
    });

  await assert.rejects(
    () => prepareCardImages(parseCatalog(validCatalog), outputDirectory),
    (error: unknown) => {
      assert(error instanceof Error);
      assert.match(error.message, /failed to save image/i);
      assert.doesNotMatch(error.message, /token|secret|\?/i);
      return true;
    },
  );
  assert.deepEqual(await readdir(outputDirectory), ["bp01-001-mr.webp"]);
});
