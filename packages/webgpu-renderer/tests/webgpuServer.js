/* global URL, console */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port =
    portIndex >= 0 && args[portIndex + 1] ? Number(args[portIndex + 1]) : 4178;
const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
const workspaceRoot = path.resolve(packageRoot, "../..");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>WebGPU Test Harness</title>
    <script type="importmap">
      {
        "imports": {
          "d3-color": "/node_modules/d3-color/src/index.js",
          "d3-interpolate": "/node_modules/d3-interpolate/src/index.js"
        }
      }
    </script>
  </head>
  <body>
    <p>WebGPU test harness</p>
  </body>
</html>
`;

const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname === "/") {
        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
        });
        res.end(html);
        return;
    }
    const file = resolveFile(pathname);
    if (file) {
        res.writeHead(200, {
            "Content-Type": getContentType(file),
            "Cache-Control": "no-store",
        });
        fs.createReadStream(file).pipe(res);
        return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
});

/**
 * @param {string} pathname
 * @returns {string | undefined}
 */
function resolveFile(pathname) {
    let root;
    if (pathname.startsWith("/src/")) {
        root = packageRoot;
    } else if (pathname.startsWith("/node_modules/")) {
        root = workspaceRoot;
    } else {
        return undefined;
    }
    const file = path.resolve(root, pathname.slice(1));
    if (
        !file.startsWith(root + path.sep) ||
        !fs.existsSync(file) ||
        !fs.statSync(file).isFile()
    ) {
        return undefined;
    }
    return file;
}

/**
 * @param {string} file
 * @returns {string}
 */
function getContentType(file) {
    if (file.endsWith(".js")) {
        return "text/javascript; charset=utf-8";
    } else if (file.endsWith(".json")) {
        return "application/json; charset=utf-8";
    } else if (file.endsWith(".png")) {
        return "image/png";
    }
    return "application/octet-stream";
}

server.listen(port, "127.0.0.1", () => {
    console.log(`[webgpu-test] server listening on ${port}`);
});
