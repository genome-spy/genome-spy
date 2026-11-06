const MAX_RETAINED_OPACITY_LAYERS = 8;
const MAX_RETAINED_OPACITY_LAYER_PIXELS = 16_777_216;

/**
 * Reuses one canvas per active opacity nesting depth. Oversized or excessively
 * deep layers remain invocation-local and are released to garbage collection.
 *
 * @param {CanvasRenderingContext2D[]} layers
 * @param {number} index
 * @param {number} width
 * @param {number} height
 */
export function acquireOpacityLayer(layers, index, width, height) {
    const pixelCount = width * height;
    let context = layers[index];
    const retainedWithoutLayer = layers.reduce(
        (sum, retained, retainedIndex) =>
            retainedIndex === index
                ? sum
                : sum + retained.canvas.width * retained.canvas.height,
        0
    );
    const retain =
        index < MAX_RETAINED_OPACITY_LAYERS &&
        retainedWithoutLayer + pixelCount <= MAX_RETAINED_OPACITY_LAYER_PIXELS;

    if (!context || !retain) {
        const canvas = document.createElement("canvas");
        context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Unable to create a Canvas2D view group.");
        }
        if (retain) {
            layers[index] = context;
        }
    }

    if (context.canvas.width != width || context.canvas.height != height) {
        context.canvas.width = width;
        context.canvas.height = height;
    } else {
        context.resetTransform();
        context.clearRect(0, 0, width, height);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    return context;
}
