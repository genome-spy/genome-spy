/* global window, document, GPUTextureUsage, GPUBufferUsage, GPUMapMode, fetch, Response, Blob, CompressionStream, btoa */

/** @param {{kind: string, dpr: number, scene: string, captureFrame?: boolean}} options */
export async function setup({ kind, dpr, scene, captureFrame = true }) {
    if (window.costScene) {
        window.costScene.renderer.destroy();
        window.costScene.canvas.remove();
    }
    const [
        { createRenderer },
        { textMark },
        { identityScale },
        { createTrueTypeFont },
        { buildOutlineTextLayout },
    ] = await Promise.all([
        import("/src/index.js"),
        import("/src/marks/text.js"),
        import("/src/scales/identity.js"),
        import("/src/fonts/trueTypeFont.js"),
        import("/src/fonts/outlineTextLayout.js"),
    ]);
    const font = createTrueTypeFont(
        await fetch("/src/fonts/DefaultFont.ttf").then((r) => r.arrayBuffer())
    );
    const specs = {
        short: { count: 1000, size: 16, word: "GenomeSpy", cols: 32 },
        stroked: {
            count: 1000,
            size: 16,
            word: "GenomeSpy",
            cols: 32,
            stroke: true,
        },
        long: { count: 128, size: 12, word: "GenomeSpy".repeat(32), cols: 16 },
        spaced: {
            count: 256,
            size: 16,
            word: "A" + " ".repeat(100) + "V",
            cols: 16,
        },
        dense: { count: 256, size: 16, word: "W".repeat(64), cols: 16 },
    };
    const spec = specs[scene];
    const spacing =
        scene === "dense"
            ? (-font.getGlyph("W").advanceWidth * spec.size) / font.unitsPerEm
            : 0;
    const words = [
        spec.word,
        scene === "dense"
            ? "W".repeat(63)
            : spec.word.slice(0, -1) + (scene === "spaced" ? "W" : "A"),
    ];
    const strings = words.map((word) => Array(spec.count).fill(word));
    const x = Float32Array.from({ length: spec.count }, (_, i) =>
        scene === "spaced"
            ? 300 + (i % 16) * 40
            : 20 + (i % spec.cols) * (1160 / spec.cols)
    );
    const y = Float32Array.from({ length: spec.count }, (_, i) =>
        scene === "short" || scene === "stroked"
            ? 18 + Math.floor(i / spec.cols) * 28
            : 35 +
              Math.floor(i / spec.cols) *
                  (820 / Math.ceil(spec.count / spec.cols))
    );
    const ids = Uint32Array.from({ length: spec.count }, (_, i) => i + 1);
    const canvas = document.createElement("canvas");
    canvas.width = 1280 * dpr;
    canvas.height = 900 * dpr;
    document.body.append(canvas);
    const renderer = await createRenderer(canvas, { format: "rgba8unorm" });
    renderer.context.configure({
        device: renderer.device,
        format: renderer.format,
        alphaMode: "premultiplied",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    renderer.updateGlobals({ width: 1280, height: 900, dpr });
    renderer.device.pushErrorScope("validation");
    const config = (text) => ({
        font,
        fontSize: spec.size,
        letterSpacing: spacing,
        channels: {
            text: { data: text },
            uniqueId: { data: ids, type: "u32" },
            x: { data: x, type: "f32", scale: identityScale() },
            y: { data: y, type: "f32", scale: identityScale() },
            size: { value: spec.size },
            fill: { value: [0.5, 0.5, 0.5, 1] },
            opacity: { value: 1 },
            stroke: { value: [0.1, 0.2, 0.8, 1] },
            strokeOpacity: { value: 1 },
            strokeWidth: {
                value: spec.stroke ? (kind === "baseline" ? 4 : 2) : 0,
            },
        },
    });
    // Warm the full glyph set and this shader variant before the measured mark.
    const warm = renderer.createMark(
        textMark,
        config(Array(spec.count).fill(words.join("") + "WVA"))
    );
    renderer.render({ items: [{ mark: warm }] });
    await renderer.device.queue.onSubmittedWorkDone();
    renderer.destroyMark(warm.markId);
    const mark = renderer.createMark(textMark, config(strings[0]));
    window.costScene = {
        renderer,
        mark,
        font,
        spec,
        spacing,
        strings,
        config,
        x,
        y,
        ids,
        buildOutlineTextLayout,
        textMark,
        canvas,
        kind,
        dpr,
    };
    renderer.render({
        items: [{ mark }],
        clearColor: { r: 0, g: 0, b: 0, a: 0 },
    });
    await renderer.device.queue.onSubmittedWorkDone();
    if (!captureFrame) {
        const error = await renderer.device.popErrorScope();
        if (error) throw Error(error.message);
        renderer.device.pushErrorScope("validation");
        if (kind === "candidate") {
            const { buildTextGlyphLookup } =
                await import("/src/marks/programs/textGlyphLookup.js");
            window.costScene.buildTextGlyphLookup = buildTextGlyphLookup;
        }
        return { kind, dpr, scene };
    }
    return await capture();
    async function capture() {
        renderer.render({
            items: [{ mark }],
            clearColor: { r: 0, g: 0, b: 0, a: 0 },
        });
        const buffer = renderer.device.createBuffer({
            size: canvas.width * canvas.height * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const encoder = renderer.device.createCommandEncoder();
        encoder.copyTextureToBuffer(
            { texture: renderer.context.getCurrentTexture() },
            { buffer, bytesPerRow: canvas.width * 4 },
            { width: canvas.width, height: canvas.height }
        );
        renderer.device.queue.submit([encoder.finish()]);
        await buffer.mapAsync(GPUMapMode.READ);
        const bytes = new Uint8Array(buffer.getMappedRange()).slice();
        buffer.unmap();
        buffer.destroy();
        let ink = 0,
            minX = canvas.width,
            minY = canvas.height,
            maxX = -1,
            maxY = -1;
        for (let i = 3; i < bytes.length; i += 4)
            if (bytes[i]) {
                ink++;
                const pixel = (i - 3) / 4,
                    px = pixel % canvas.width,
                    py = Math.floor(pixel / canvas.width);
                minX = Math.min(minX, px);
                maxX = Math.max(maxX, px);
                minY = Math.min(minY, py);
                maxY = Math.max(maxY, py);
            }
        const layout = buildOutlineTextLayout(strings[0], font, {
            fontSize: spec.size,
            letterSpacing: spacing,
        });
        let lookup = null;
        if (kind === "candidate") {
            const { buildTextGlyphLookup } =
                await import("/src/marks/programs/textGlyphLookup.js");
            window.costScene.buildTextGlyphLookup = buildTextGlyphLookup;
            const l = buildTextGlyphLookup(layout),
                words = new Uint32Array(l.metrics.buffer);
            let headers = 0,
                maxCandidates = 0;
            for (let i = 0; i < spec.count; i++) {
                const start = words[i * 8 + 4],
                    bins = words[i * 8 + 5];
                headers += bins + 1;
                for (let b = 0; b < bins; b++)
                    maxCandidates = Math.max(
                        maxCandidates,
                        l.data[start + b + 1] - l.data[start + b]
                    );
            }
            lookup = {
                metricsBytes: l.metrics.byteLength,
                dataBytes: l.data.byteLength,
                headers,
                maxCandidates,
            };
        }
        const compressed = new Uint8Array(
            await new Response(
                new Blob([bytes])
                    .stream()
                    .pipeThrough(new CompressionStream("gzip"))
            ).arrayBuffer()
        );
        let raw = "";
        for (let i = 0; i < compressed.length; i += 32768)
            raw += String.fromCharCode(...compressed.subarray(i, i + 32768));
        const validation = await renderer.device.popErrorScope();
        const program = renderer._marks.get(mark.markId);
        window.costScene.frame = bytes;
        return {
            kind,
            dpr,
            scene,
            labels: spec.count,
            glyphs: layout.glyphIds.length,
            drawInstances: program.resolveDrawRange(0, spec.count)
                .instanceCount,
            wordLength: spec.word.length,
            letterSpacing: spacing,
            textWidth: layout.textWidth[0],
            firstGlyphX: Array.from(
                layout.xOffset.slice(0, scene === "dense" ? 64 : 2)
            ),
            ink,
            bounds: [minX, minY, maxX, maxY],
            lookup,
            validation: validation?.message ?? null,
            compressed: btoa(raw),
        };
    }
}
