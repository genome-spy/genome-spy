import http from "node:http";

// eslint-disable-next-line no-undef
const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port =
    portIndex >= 0 && args[portIndex + 1] ? Number(args[portIndex + 1]) : 4178;

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>WebGPU Test Harness</title>
  </head>
  <body>
    <p>WebGPU test harness</p>
  </body>
</html>
`;

const server = http.createServer((req, res) => {
    if (req.url === "/") {
        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
        });
        res.end(html);
        return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
});

server.listen(port, "127.0.0.1", () => {
    // eslint-disable-next-line no-console
    console.log(`[webgpu-test] server listening on ${port}`);
});
