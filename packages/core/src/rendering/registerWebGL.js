import { renderingModules } from "./renderingModuleRegistry.js";

renderingModules.webglBackend = async (options) => {
    const { createWebGLRenderingBackend } = await import("./webgl/index.js");
    return createWebGLRenderingBackend(options);
};
