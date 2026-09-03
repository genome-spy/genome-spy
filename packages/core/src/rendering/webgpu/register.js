import { renderingModules } from "../renderingModuleRegistry.js";

// Opt in from the playground. This module and the adapter are excluded from
// published Core packages; the default Core entry does not import them.
renderingModules.webgpuBackend = async (options) => {
    const { createWebGpuRenderingBackend } = await import("./index.js");
    return createWebGpuRenderingBackend(options);
};
