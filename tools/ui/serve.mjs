/* 静的サーバ。ブラウザ検証の土台。
 *
 *   node tools/ui/serve.mjs [ポート]
 *
 * ビルドは無いのでリポジトリのファイルをそのまま配る。
 */

import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./harness.mjs";

const PORT = Number(process.argv[2] || 8099);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";

  // ルート外へ出るパスはここでは許可しない（ローカル検証用のため）
  const file = path.join(REPO_ROOT, rel);
  if (!file.startsWith(REPO_ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  let stat;
  try {
    stat = statSync(file);
  } catch {
    res.writeHead(404).end("not found");
    return;
  }
  if (stat.isDirectory()) {
    res.writeHead(302, { Location: rel + "/" }).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Content-Length": stat.size,
    // キャッシュで古い結果を読むことを防ぐ（検証では常に最新enched を見たい）
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`serving ${REPO_ROOT}`);
  console.log(`http://localhost:${PORT}/`);
});