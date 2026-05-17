// Post-build: создаём dist/super/index.html — копия обычного index.html, но с
// admin-manifest и admin-touch-icon ПРОПИСАННЫМИ ИЗНАЧАЛЬНО в head.
// Это нужно потому что iOS Safari читает manifest/apple-touch-icon в момент
// «Добавить на экран» и не подхватывает позднюю подмену через JS — поэтому
// без отдельного HTML обе PWA устанавливаются с одной иконкой и stato_url=/sale.
//
// Nginx должен быть настроен чтобы /super* отдавал именно этот файл.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distDir = resolve(root, "dist");
const srcHtml = resolve(distDir, "index.html");
const outDir = resolve(distDir, "super");
const outHtml = resolve(outDir, "index.html");

const html = readFileSync(srcHtml, "utf8");
const adminHtml = html
  .replace(
    /<link[^>]+rel="apple-touch-icon"[^>]*>/,
    '<link rel="apple-touch-icon" sizes="180x180" href="/admin-icon-180.png" />',
  )
  .replace(
    /<link[^>]+rel="manifest"[^>]*>/,
    '<link id="app-manifest" rel="manifest" href="/admin-manifest.json" />',
  )
  .replace(
    /<meta[^>]+name="apple-mobile-web-app-title"[^>]*>/,
    '<meta id="apple-title" name="apple-mobile-web-app-title" content="VoltAdmin" />',
  )
  .replace(/<title>[^<]*<\/title>/, "<title>VoltPos Admin</title>");

mkdirSync(outDir, { recursive: true });
writeFileSync(outHtml, adminHtml, "utf8");
console.log("✓ dist/super/index.html сгенерирован");
