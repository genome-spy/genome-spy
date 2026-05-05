// Vite dev server entrypoint.

import { createServer as createViteServer } from "vite";
import viteConfig from "./vite.config.js";

async function createServer() {
    const config =
        typeof viteConfig === "function"
            ? await viteConfig({
                  command: "serve",
                  mode: "development",
                  isSsrBuild: false,
                  isPreview: false,
              })
            : viteConfig;

    const vite = await createViteServer(config);

    await vite.listen();
    vite.printUrls();
}

void createServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
