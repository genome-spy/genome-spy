/** The DOM library does not yet include the WebGPU canvas context overload. */
interface HTMLCanvasElement {
    getContext(contextId: "webgpu"): GPUCanvasContext | null;
}
