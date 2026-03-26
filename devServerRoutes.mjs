import fs from "fs";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.join(repoRoot, "examples");
const vegaDatasetsDir = path.join(
    repoRoot,
    "node_modules",
    "vega-datasets",
    "data"
);
const privateDir = path.join(repoRoot, "private");
const legacyPrivateDir = path.join(repoRoot, "packages", "core", "private");
const legacyPrivateExists = fs.existsSync(legacyPrivateDir);
const hiddenSharedDirs = new Set(["data", "shared"]);

/**
 * @returns {import("vite").Plugin}
 */
export function createAppDevServerPlugin() {
    return {
        name: "genome-spy-app-dev-routes",

        configureServer(server) {
            if (legacyPrivateExists) {
                server.config.logger.warn(
                    "Legacy private specs detected at packages/core/private/. " +
                        "The dev server still serves them at /private, but repo-root private/ is the preferred location."
                );
            }

            server.middlewares.use("/", specList);
            registerSharedStaticRoutes(server);
        },
    };
}

/**
 * @param {string | URL} screenshotPagePath
 * @returns {import("vite").Plugin}
 */
export function createCoreDevServerPlugin(screenshotPagePath) {
    return {
        name: "genome-spy-core-dev-routes",

        configureServer(server) {
            if (legacyPrivateExists) {
                server.config.logger.warn(
                    "Legacy private specs detected at packages/core/private/. " +
                        "The dev server still serves them at /private, but repo-root private/ is the preferred location."
                );
            }

            registerSharedStaticRoutes(server);
            server.middlewares.use("/__health", healthCheck);
            server.middlewares.use("/screenshot.html", (_req, res) => {
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                res.end(fs.readFileSync(screenshotPagePath));
            });
        },
    };
}

/**
 * @param {import("vite").ViteDevServer} server
 */
function registerSharedStaticRoutes(server) {
    server.middlewares.use(
        "/examples/vega-datasets",
        express.static(vegaDatasetsDir)
    );
    server.middlewares.use("/examples", express.static(examplesDir));
    server.middlewares.use("/private", express.static(privateDir));
    server.middlewares.use("/private", express.static(legacyPrivateDir));
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {() => void} next
 */
function specList(req, res, next) {
    if (req.url !== "/") {
        return next();
    }

    const privateListingSource = getPrivateListingSource();
    const legacyPrivateWarning = legacyPrivateExists
        ? `
    <p style="color: firebrick">
        Legacy <code>packages/core/private/</code> is still present and served at
        <code>/private</code>. Move it manually to repo-root <code>private/</code>
        when you are ready.
    </p>
    `
        : "";

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`
<html>
    <head><title>GenomeSpy Dev Server</title></head>
    <body>

    <h1>GenomeSpy Dev Server</h1>

    <h2>Example specs</h2>

    <p>These examples are in the repo-root <code>examples/</code> directory.</p>

    <p>
        Curated examples under <code>examples/core/</code>, <code>examples/docs/</code>,
        and <code>examples/app/</code> resolve relative asset paths against
        <code>/examples/</code>. Use tidy paths such as <code>data/sincos.csv</code>
        instead of climbing up with <code>../</code>.
    </p>

    <p>
        In the deployed docs, the same curated examples resolve against
        <code>/docs/examples/</code>, which keeps the source specs identical across
        local dev, docs, and playground.
    </p>

    ${getFileList(examplesDir, "", "examples")}

    <h2>Private specs</h2>

    <p>
        Use repo-root <code>private/</code> for files that should not be added to Git.
        The dev server currently lists specs from
        <code>${privateListingSource.label}</code> and serves them at <code>/private</code>.
    </p>

    <p>
        Private specs are treated like standalone project folders: their default base
        URL is the spec file directory, so sibling-relative paths keep working.
    </p>

    ${legacyPrivateWarning}

    ${getFileList(privateListingSource.directory, "", "private")}

    </body>
</html>
    `);
}

/**
 * @returns {{ directory: string, label: string }}
 */
function getPrivateListingSource() {
    if (fs.existsSync(privateDir)) {
        return {
            directory: privateDir,
            label: "private/",
        };
    }

    return {
        directory: legacyPrivateDir,
        label: "packages/core/private/",
    };
}

/**
 * @param {string} specRoot
 * @param {string} dir
 * @param {string} urlRoot
 * @returns {string}
 */
function getFileList(specRoot, dir, urlRoot) {
    const joinedPath = path.join(specRoot, dir);

    if (!fs.existsSync(joinedPath)) {
        return `<p style="color: firebrick">Directory not found.</p>`;
    }

    const relativeDir = dir.split(path.sep).join("/");

    return (
        "<ul>" +
        fs
            .readdirSync(joinedPath, { withFileTypes: true })
            .filter(
                (f) =>
                    !/^[_.]/.test(f.name) &&
                    !(dir === "" && hiddenSharedDirs.has(f.name)) &&
                    (path.extname(f.name) == ".json" || f.isDirectory())
            )
            .map((f) =>
                f.isDirectory()
                    ? `<li><span>${f.name}/</span>${getFileList(
                          specRoot,
                          path.join(dir, f.name),
                          urlRoot
                      )}</li>`
                    : `<li><a href="/?spec=${path.posix.join(
                          urlRoot,
                          relativeDir,
                          f.name
                      )}">${f.name}</a></li>`
            )
            .join("\n") +
        "</ul>"
    );
}

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 */
function healthCheck(_req, res) {
    res.setHeader("Content-Type", "text/plain");
    res.end("ok");
}
