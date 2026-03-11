// Vite dev server with some custom paths for static files

import fs from "fs";
import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { URL } from "url";

const __dirname = new URL(".", import.meta.url).pathname;
const repoRoot = path.resolve(__dirname, "..", "..");
const examplesDir = path.join(repoRoot, "examples");
const privateDir = path.join(repoRoot, "private");
const legacyPrivateDir = path.join(repoRoot, "packages", "core", "private");

async function createServer() {
    const app = express();

    const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "mpa",
    });

    if (fs.existsSync(legacyPrivateDir)) {
        console.warn(
            "Legacy private specs detected at packages/core/private/. " +
                "The dev server still serves them at /private, but repo-root private/ is the preferred location."
        );
    }

    app.use("/examples", express.static(examplesDir));

    app.use("/private", express.static(privateDir));
    app.use("/private", express.static(legacyPrivateDir));

    app.use(vite.middlewares);

    app.listen(8080);
}

createServer();
