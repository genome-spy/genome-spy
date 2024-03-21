// Vite dev server with some custom paths for static files

import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { URL } from "url";

async function createServer() {
    const app = express();

    const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "mpa",
    });

    const __dirname = new URL(".", import.meta.url).pathname;

    // Random examples
    app.use("/examples", express.static(path.join(__dirname, "examples")));

    // Files that must not go into git
    app.use("/private", express.static(path.join(__dirname, "private")));

    app.use(vite.middlewares);

    app.listen(8080);
}

createServer();
