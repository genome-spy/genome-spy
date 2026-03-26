// Vite dev server entrypoint.

import { createServer as createViteServer } from "vite";
import viteConfig from "./vite.config.js";

async function createServer() {
    const vite = await createViteServer(viteConfig);

    await vite.listen();
    vite.printUrls();
}

void createServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
