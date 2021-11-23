/* eslint-disable no-undef */

// Vite dev server with some custom paths for static files

const path = require("path");
const express = require("express");
const { createServer: createViteServer } = require("vite");

async function createServer() {
    const app = express();

    const vite = await createViteServer({
        server: { middlewareMode: "html" },
    });

    // Random examples
    app.use(
        "/examples",
        express.static(path.join(__dirname, "../core/examples"))
    );

    // Files that must not go into git
    app.use(
        "/private",
        express.static(path.join(__dirname, "../core/private"))
    );

    app.use(vite.middlewares);

    app.listen(8080);
}

createServer();
