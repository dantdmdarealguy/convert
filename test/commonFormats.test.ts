import { afterAll, expect, test } from "bun:test";
import puppeteer from "puppeteer";
import type { FileData, FormatHandler, FileFormat, ConvertPathNode } from "../src/FormatHandler.js";
import CommonFormats from "../src/CommonFormats.js";

declare global {
  interface Window {
    queryFormatNode: (testFunction: (value: ConvertPathNode) => boolean) => ConvertPathNode | undefined;
    tryConvertByTraversing: (files: FileData[], from: ConvertPathNode, to: ConvertPathNode) => Promise<{
      files: FileData[];
      path: ConvertPathNode[];
    } | null>;
  }
}

// Set up a basic webserver to host the distribution build
const server = Bun.serve({
  async fetch (req) {
    let path = new URL(req.url).pathname.replace("/convert/", "") || "index.html";
    path = path.replaceAll("..", "");
    if (path.startsWith("/test/")) path = "../test/resources/" + path.slice(6);
    const file = Bun.file(`${__dirname}/../dist/${path}`);
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });
    return new Response(file);
  },
  port: 8080
});

// Start puppeteer, wait for ready confirmation
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});
const page = await browser.newPage();

await Promise.all([
  new Promise(resolve => {
    page.on("console", msg => {
      const text = msg.text();
      if (text === "Built initial format list.") resolve(null);
    });
  }),
  page.goto("http://localhost:8080/convert/index.html")
]);

console.log("Setup finished.");

const dummyHandler: FormatHandler = {
  name: "dummy",
  ready: true,
  async init () { },
  async doConvert (inputFiles, inputFormat, outputFormat, args) {
    return [];
  }
};

function attemptConversion (
  files: string[],
  from: FileFormat,
  to: FileFormat
) {
  return page.evaluate(async (testFileNames, from, to) => {
    const files: FileData[] = [];
    for (const fileName of testFileNames) {
      files.push({
        bytes: await fetch("/test/" + fileName).then(r => r.bytes()),
        name: fileName
      });
    }
    return await window.tryConvertByTraversing(files, from, to);
  },
    files,
    { format: from, handler: dummyHandler },
    { format: to, handler: dummyHandler }
  );
}

// ==================================================================
//                         START OF TESTS
// ==================================================================

test("png → jpeg", async () => {

  const conversion = await attemptConversion(
    ["colors_50x50.png"],
    CommonFormats.PNG,
    CommonFormats.JPEG
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["image/png", "image/jpeg"]);

}, { timeout: 60000 });

test("png → svg", async () => {

  const conversion = await attemptConversion(
    ["colors_50x50.png"],
    CommonFormats.PNG,
    CommonFormats.SVG
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["image/png", "image/svg+xml"]);

}, { timeout: 60000 });

test("mp4 → apng", async () => {

  const conversion = await attemptConversion(
    ["doom.mp4"],
    CommonFormats.MP4,
    CommonFormats.PNG
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.format)).toEqual(["mp4", "apng"]);
  expect(conversion?.files.length).toBe(1);

}, { timeout: 60000 });

test("png → mp4", async () => {

  const conversion = await attemptConversion(
    ["colors_50x50.png"],
    CommonFormats.PNG,
    CommonFormats.MP4
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["image/png", "video/mp4"]);

}, { timeout: 60000 });

test("png → wav → mp3", async () => {

  const conversion = await attemptConversion(
    ["colors_50x50.png"],
    CommonFormats.PNG,
    CommonFormats.MP3
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["image/png", "audio/wav", "audio/mpeg"]);

}, { timeout: 60000 });

test("mp3 → png → gif", async () => {

  const conversion = await attemptConversion(
    ["gaster.mp3"],
    CommonFormats.MP3,
    CommonFormats.GIF
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["audio/mpeg", "image/png", "image/gif"]);

}, { timeout: 60000 });

test("docx → html → svg → png → pdf", async () => {

  const conversion = await attemptConversion(
    ["word.docx"],
    CommonFormats.DOCX,
    CommonFormats.PDF
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/html", "image/svg+xml", "image/png", "application/pdf"
  ]);
  const fileSize = Object.values(conversion!.files[0].bytes).length;
  expect(fileSize).toBeWithin(55000, 65000);

}, { timeout: 60000 });

test("md → docx", async () => {

  const conversion = await attemptConversion(
    ["markdown.md"],
    CommonFormats.MD,
    CommonFormats.DOCX
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "text/markdown", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);

}, { timeout: 60000 });

test("txt → wav → flac", async () => {

  const conversion = await attemptConversion(
    ["markdown.md"],
    CommonFormats.TEXT,
    CommonFormats.FLAC
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "text/plain", "audio/wav", "audio/flac"
  ]);
  expect(conversion!.path[1].handler.name).toBe("espeakng");

}, { timeout: 60000 });

test("png → bmp", async () => {

  const conversion = await attemptConversion(
    ["colors_50x50.png"],
    CommonFormats.PNG,
    CommonFormats.BMP
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["image/png", "image/bmp"]);

}, { timeout: 60000 });

test("png → tiff", async () => {

  const conversion = await attemptConversion(
    ["colors_50x50.png"],
    CommonFormats.PNG,
    CommonFormats.TIFF
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["image/png", "image/tiff"]);

}, { timeout: 60000 });

test("png → ico", async () => {

  const conversion = await attemptConversion(
    ["colors_50x50.png"],
    CommonFormats.PNG,
    CommonFormats.ICO
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["image/png", "image/x-icon"]);

}, { timeout: 60000 });

test("png → webp", async () => {

  const conversion = await attemptConversion(
    ["colors_50x50.png"],
    CommonFormats.PNG,
    CommonFormats.WEBP
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["image/png", "image/webp"]);

}, { timeout: 60000 });

test("webp → jpeg", async () => {

  const conversion = await attemptConversion(
    ["colors_50x50.png"],
    CommonFormats.WEBP,
    CommonFormats.JPEG
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["image/webp", "image/jpeg"]);

}, { timeout: 60000 });

test("mp4 → webm", async () => {

  const conversion = await attemptConversion(
    ["doom.mp4"],
    CommonFormats.MP4,
    CommonFormats.WEBM
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["video/mp4", "video/webm"]);

}, { timeout: 60000 });

test("mp4 → avi", async () => {

  const conversion = await attemptConversion(
    ["doom.mp4"],
    CommonFormats.MP4,
    CommonFormats.AVI
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["video/mp4", "video/x-msvideo"]);

}, { timeout: 60000 });

test("mp4 → mkv", async () => {

  const conversion = await attemptConversion(
    ["doom.mp4"],
    CommonFormats.MP4,
    CommonFormats.MKV
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["video/mp4", "video/x-matroska"]);

}, { timeout: 60000 });

test("mp4 → mov", async () => {

  const conversion = await attemptConversion(
    ["doom.mp4"],
    CommonFormats.MP4,
    CommonFormats.MOV
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["video/mp4", "video/quicktime"]);

}, { timeout: 60000 });

test("mp4 → flv", async () => {

  const conversion = await attemptConversion(
    ["doom.mp4"],
    CommonFormats.MP4,
    CommonFormats.FLV
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["video/mp4", "video/x-flv"]);

}, { timeout: 60000 });

test("mp3 → ogg", async () => {

  const conversion = await attemptConversion(
    ["gaster.mp3"],
    CommonFormats.MP3,
    CommonFormats.OGG
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["audio/mpeg", "audio/ogg"]);

}, { timeout: 60000 });

test("mp3 → flac", async () => {

  const conversion = await attemptConversion(
    ["gaster.mp3"],
    CommonFormats.MP3,
    CommonFormats.FLAC
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["audio/mpeg", "audio/flac"]);

}, { timeout: 60000 });

test("mp3 → aac", async () => {

  const conversion = await attemptConversion(
    ["gaster.mp3"],
    CommonFormats.MP3,
    CommonFormats.AAC
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["audio/mpeg", "audio/aac"]);

}, { timeout: 60000 });

test("mp3 → wav", async () => {

  const conversion = await attemptConversion(
    ["gaster.mp3"],
    CommonFormats.MP3,
    CommonFormats.WAV
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["audio/mpeg", "audio/wav"]);

}, { timeout: 60000 });

test("md → html", async () => {

  const conversion = await attemptConversion(
    ["markdown.md"],
    CommonFormats.MD,
    CommonFormats.HTML
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "text/markdown", "text/html"
  ]);

}, { timeout: 60000 });

test("md → epub", async () => {

  const conversion = await attemptConversion(
    ["markdown.md"],
    CommonFormats.MD,
    CommonFormats.EPUB
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "text/markdown", "application/epub+zip"
  ]);

}, { timeout: 60000 });

test("md → odt", async () => {

  const conversion = await attemptConversion(
    ["markdown.md"],
    CommonFormats.MD,
    CommonFormats.ODT
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "text/markdown", "application/vnd.oasis.opendocument.text"
  ]);

}, { timeout: 60000 });

test("md → rtf", async () => {

  const conversion = await attemptConversion(
    ["markdown.md"],
    CommonFormats.MD,
    CommonFormats.RTF
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "text/markdown", "application/rtf"
  ]);

}, { timeout: 60000 });

test("md → latex", async () => {

  const conversion = await attemptConversion(
    ["markdown.md"],
    CommonFormats.MD,
    CommonFormats.LATEX
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "text/markdown", "application/x-tex"
  ]);

}, { timeout: 60000 });

test("docx → epub", async () => {

  const conversion = await attemptConversion(
    ["word.docx"],
    CommonFormats.DOCX,
    CommonFormats.EPUB
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/epub+zip"
  ]);

}, { timeout: 60000 });

test("docx → odt", async () => {

  const conversion = await attemptConversion(
    ["word.docx"],
    CommonFormats.DOCX,
    CommonFormats.ODT
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.oasis.opendocument.text"
  ]);

}, { timeout: 60000 });

test("docx → rtf", async () => {

  const conversion = await attemptConversion(
    ["word.docx"],
    CommonFormats.DOCX,
    CommonFormats.RTF
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/rtf"
  ]);

}, { timeout: 60000 });

// ==================================================================
//                          END OF TESTS
// ==================================================================


afterAll(async () => {
  await browser.close();
  server.stop();
});
