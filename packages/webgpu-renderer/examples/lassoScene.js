import { createRenderer } from "../src/index.js";
import { pointMark } from "../src/marks/point.js";
import { linearScale } from "../src/scales/linear.js";
import { LassoSelection } from "../src/utils/lassoSelection.js";
import { LassoImage } from "../src/utils/lassoImage.js";

/**
 * Standalone live compute demo; supplied positions are already projected.
 * @param {HTMLCanvasElement} canvas
 * @param {{count?: number, data?: {x: Float32Array, y: Float32Array, ids: Uint32Array}, onStatus?: (status: string) => void, onSelection?: (selection: {polygon: ReadonlyArray<readonly [number,number]>, ids: Uint32Array}) => void}} [options]
 */
export default async function runLassoScene(
    canvas,
    {
        count = 1_000_000,
        data,
        onStatus = () => {},
        onSelection = () => {},
    } = {}
) {
    count = data ? data.ids.length : count;
    if (!Number.isSafeInteger(count) || count < 1 || count > 10_000_000)
        throw new Error("Choose 1–10,000,000 points.");
    const renderer = await createRenderer(canvas, {
        onDeviceLoss: (info) => {
            if (info.reason !== "destroyed")
                onStatus("WebGPU device lost: " + info.message);
        },
    });
    if (!data) {
        const x = new Float32Array(count);
        const y = new Float32Array(count);
        const ids = new Uint32Array(count);
        let seed = 42;
        const random = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        for (let i = 0; i < count; i++) {
            const cluster = i % 5;
            const radius = Math.sqrt(-2 * Math.log(1 - random()));
            const angle = random() * 2 * Math.PI;
            x[i] = 0.15 + cluster * 0.17 + radius * Math.cos(angle) * 0.04;
            y[i] =
                0.5 +
                Math.sin(cluster * 2) * 0.23 +
                radius * Math.sin(angle) * 0.06;
            ids[i] = i + 1;
        }
        data = { x, y, ids };
    }
    const { x, y, ids } = data;
    /** @type {LassoSelection} */
    let lasso;
    try {
        lasso = new LassoSelection(renderer.device, { x, y, ids });
    } catch (error) {
        renderer.destroy();
        throw error;
    }
    const mark = renderer.createMark(pointMark, {
        channels: {
            x: {
                data: x,
                type: "f32",
                scale: linearScale({ domain: [0, 1], range: [0, 1] }),
            },
            y: {
                data: y,
                type: "f32",
                scale: linearScale({ domain: [0, 1], range: [1, 0] }),
            },
            size: { value: 2 },
            strokeWidth: { value: 0 },
            fill: { value: [0.4, 0.46, 0.55, 0.15] },
        },
    });
    const image = new LassoImage(canvas, lasso);
    const parent = canvas.parentElement;
    parent.style.position = "relative";
    const overlay = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
    );
    Object.assign(overlay.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
    });
    const path = document.createElementNS(overlay.namespaceURI, "path");
    path.setAttribute("fill", "#f973161a");
    path.setAttribute("stroke", "#ea580c");
    overlay.append(path);
    parent.append(overlay);
    /** @type {[number,number][]} */
    let polygon = [];
    /** @type {[number,number,number,number]} */
    let view = [0, 0, 1, 1];
    let drawing = false;
    let disposed = false;
    let frame = 0;
    let pending = false;
    let busy = false;
    let gesture = 0;
    let width = 1;
    let height = 1;
    let recapture = false;
    let initialized = false;
    let readPending = false;
    function outline() {
        overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
        path.setAttribute(
            "d",
            polygon.length
                ? polygon
                      .map(([a, b], i) => {
                          const x =
                              ((a - view[0]) / (view[2] - view[0])) * width;
                          const y =
                              (1 - (b - view[1]) / (view[3] - view[1])) *
                              height;
                          return `${i ? "L" : "M"}${x},${y}`;
                      })
                      .join(" ") + " Z"
                : ""
        );
    }
    function resize() {
        const rect = canvas.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        recapture = true;
        flush();
    }
    async function updateSelection() {
        if (busy || disposed) return;
        busy = true;
        try {
            while (pending && !disposed) {
                pending = false;
                const currentGesture = gesture;
                if (recapture) {
                    recapture = false;
                    const dpr = window.devicePixelRatio;
                    canvas.width = Math.max(1, Math.floor(width * dpr));
                    canvas.height = Math.max(1, Math.floor(height * dpr));
                    renderer.updateGlobals({
                        width: canvas.width / dpr,
                        height: canvas.height / dpr,
                        dpr,
                    });
                    mark.scales.x.setRange([0, canvas.width / dpr]);
                    mark.scales.y.setRange([canvas.height / dpr, 0]);
                    mark.scales.x.setDomain([view[0], view[2]]);
                    mark.scales.y.setDomain([view[1], view[3]]);
                    image.capture(() => renderer.render(), view);
                }
                const active = polygon.length >= 3;
                if (active) lasso.update(polygon);
                else lasso.clear();
                image.render();

                // Keep only the latest polygon while this GPU batch is running.
                await renderer.device.queue.onSubmittedWorkDone();
                if (disposed) return;
                if (pending || drawing || !active || !readPending) continue;

                onStatus("Reading a snapshot of selected IDs…");
                const snapshot = await lasso.readIds();
                if (
                    !disposed &&
                    !pending &&
                    currentGesture === gesture &&
                    snapshot.revision === lasso.revision
                ) {
                    readPending = false;
                    onSelection({
                        polygon: polygon.map((p) => [p[0], p[1]]),
                        ids: snapshot.ids,
                    });
                    onStatus(
                        `Selected ${snapshot.ids.length.toLocaleString()} IDs. First IDs: ${Array.from(snapshot.ids.subarray(0, 8)).join(", ")}. GPU append order is unspecified.`
                    );
                }
            }
        } catch (error) {
            if (!initialized) throw error;
            if (!disposed)
                onStatus(
                    error instanceof Error ? error.message : String(error)
                );
        } finally {
            busy = false;
        }
    }
    function flush() {
        cancelAnimationFrame(frame);
        frame = 0;
        outline();
        pending = true;
        void updateSelection();
    }
    /** @param {MouseEvent} event @returns {[number,number]} */
    function position(event) {
        const rect = canvas.getBoundingClientRect();
        return [
            Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
            1 -
                Math.max(
                    0,
                    Math.min(1, (event.clientY - rect.top) / rect.height)
                ),
        ];
    }
    /** @param {PointerEvent} event */
    function append(event) {
        const [px, py] = position(event);
        const a = view[0] + px * (view[2] - view[0]);
        const b = view[1] + py * (view[3] - view[1]);
        const last = polygon.at(-1);
        if (
            last &&
            Math.hypot(
                ((a - last[0]) / (view[2] - view[0])) * width,
                ((b - last[1]) / (view[3] - view[1])) * height
            ) < 5
        )
            return;
        // shortcut: retain at most 512 trace vertices, simplify longer drags for production.
        if (polygon.length === 512) polygon[511] = [a, b];
        else polygon.push([a, b]);
        if (!frame) frame = requestAnimationFrame(flush);
    }
    /** @param {WheelEvent} event */
    function zoom(event) {
        event.preventDefault();
        if (drawing) return;
        const [px, py] = position(event);
        const delta =
            event.deltaY *
            (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
        const span = view[2] - view[0];
        const nextSpan = Math.max(
            1 / 32,
            Math.min(1, span * 2 ** (delta * (event.ctrlKey ? 0.01 : 0.002)))
        );
        if (nextSpan === span) return;
        const x0 = Math.max(
            0,
            Math.min(1 - nextSpan, view[0] + px * (span - nextSpan))
        );
        const y0 = Math.max(
            0,
            Math.min(1 - nextSpan, view[1] + py * (span - nextSpan))
        );
        view = [x0, y0, x0 + nextSpan, y0 + nextSpan];
        recapture = true;
        if (!frame) frame = requestAnimationFrame(flush);
    }
    /** @param {MouseEvent} event */
    function resetZoom(event) {
        event.preventDefault();
        if (drawing) return;
        view = [0, 0, 1, 1];
        recapture = true;
        flush();
    }
    /** @param {PointerEvent} event */
    function down(event) {
        if (event.button !== 0 || event.ctrlKey || drawing) return;
        drawing = true;
        readPending = false;
        polygon = [];
        gesture++;
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        onStatus(
            `Drawing over ${count.toLocaleString()} points. Image colors show local selected-cell fraction; no point redraw or ID readback while drawing.`
        );
        append(event);
    }
    /** @param {PointerEvent} event */
    function move(event) {
        if (drawing) append(event);
    }
    /** @param {PointerEvent} event */
    function up(event) {
        if (!drawing) return;
        drawing = false;
        readPending = true;
        append(event);
        flush();
    }
    function cancel() {
        drawing = false;
        readPending = false;
        polygon = [];
        gesture++;
        flush();
        onStatus("Selection cleared.");
    }
    /** @param {KeyboardEvent} event */
    function keydown(event) {
        if (event.key === "Escape") cancel();
    }
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    recapture = pending = true;
    window.addEventListener("resize", resize);
    try {
        await updateSelection();
        initialized = true;
    } catch (error) {
        window.removeEventListener("resize", resize);
        image.destroy();
        renderer.destroy();
        lasso.destroy();
        overlay.remove();
        throw error;
    }
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("wheel", zoom, { passive: false });
    canvas.addEventListener("contextmenu", resetZoom);
    window.addEventListener("keydown", keydown);
    onStatus(
        `Ready: ${count.toLocaleString()} points. Drag to select; Escape clears. Scroll to zoom; right-click resets zoom. Hash table: ${(lasso.table.size / 1048576).toFixed(1)} MiB.`
    );
    return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", resize);
        canvas.removeEventListener("pointerdown", down);
        canvas.removeEventListener("pointermove", move);
        canvas.removeEventListener("pointerup", up);
        canvas.removeEventListener("pointercancel", cancel);
        canvas.removeEventListener("wheel", zoom);
        canvas.removeEventListener("contextmenu", resetZoom);
        window.removeEventListener("keydown", keydown);
        overlay.remove();
        renderer.destroy();
        image.destroy();
        lasso.destroy();
    };
}
