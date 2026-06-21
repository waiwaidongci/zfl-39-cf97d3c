import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { send } from "./lib/db.js";
import { handleApi } from "./routes/api.js";
import { handlePages } from "./routes/pages.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3039);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

async function serveStatic(req, res, url) {
  if (!url.pathname.startsWith("/public/")) return false;
  const filePath = join(__dirname, url.pathname);
  try {
    const content = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const mimeType = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mimeType });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;

    if (await serveStatic(req, res, url)) return;

    if (handlePages(req, res, url)) return;

    const apiResult = await handleApi(req, res, url, method);
    if (apiResult !== null) return;

    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

server.listen(port, () => console.log("古法纸浆发酵记录 listening on http://localhost:" + port));
