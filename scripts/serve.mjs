import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4174);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function getSafePath(urlPath) {
  const clean = urlPath === "/" ? "/index.html" : urlPath;
  const normalized = path.normalize(clean).replace(/^(\.\.[/\\])+/, "");
  return path.join(root, normalized);
}

createServer(async (request, response) => {
  try {
    const safePath = getSafePath(new URL(request.url, "http://localhost").pathname);
    const content = await readFile(safePath);
    const extension = path.extname(safePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "text/plain; charset=utf-8"
    });
    response.end(content);
  } catch (error) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Not found");
  }
}).listen(port, () => {
  console.log(`PackMCP dev server running at http://localhost:${port}`);
});
