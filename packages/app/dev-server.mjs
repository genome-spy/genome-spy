// Vite dev server with some custom paths for static files

import fs from "fs";
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

    app.use("/", specList);

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

function getFileList(specRoot, dir) {
    const joinedPath = path.join(specRoot, dir);

    if (!fs.existsSync(joinedPath)) {
        return `<p style="color: firebrick">Directory not found.</p>`;
    }

    return (
        "<ul>" +
        fs
            .readdirSync(joinedPath, { withFileTypes: true })
            .filter(
                (f) =>
                    !/^[_.]/.test(f.name) &&
                    (path.extname(f.name) == ".json" || f.isDirectory())
            )
            .map((f) =>
                f.isDirectory()
                    ? `<li><span>${f.name}/</span>${getFileList(
                          specRoot,
                          path.join(dir, f.name)
                      )}</li>`
                    : `<li><a href="/?spec=${dir}/${f.name}">${f.name}</a></li>`
            )
            .join("\n") +
        "</ul>"
    );
}

function specList(req, res, next) {
    if (req.url !== "/") {
        return next();
    }

    const __dirname = new URL(".", import.meta.url).pathname;
    const specDir = path.join(__dirname, "..", "core");

    res.send(`
<html>
    <head><title>GenomeSpy Dev Server</title></head>
    <body>

    <h1>GenomeSpy Dev Server</h1>

    <h2>Example specs</h2>

    <p>These examples are in the <code>packages/core/examples/</code> directory.</p>

    ${getFileList(specDir, "examples")}

    <h2>Private specs</h2>

    <p>
        These specs are in the <code>packages/core/private/</code> directory, if it exists.
        Use the <code>private</code> directory for files that should not be added to Git.
    </p>

    ${getFileList(specDir, "private")}

    </body>
</html>
    `);
}
