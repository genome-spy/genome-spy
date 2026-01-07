import { createExampleRenderer, setupResize } from "./utils.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runIndexScene(canvas) {
    const renderer = await createExampleRenderer(canvas);

    const count = 60;
    const datasets = {
        u32: {
            label: "u32 (~2e9)",
            start: 2_000_000_000,
            span: 1200,
            inputComponents: 1,
            makeArray: () => new Uint32Array(count),
        },
        large: {
            label: "packed (~1e11)",
            start: 100_000_000_000,
            span: 1200,
            inputComponents: 2,
            makeArray: () => new Float64Array(count),
        },
    };

    const toolbar = document.querySelector(".toolbar");
    const modeLabel = document.createElement("label");
    const modeText = document.createElement("span");
    const modeSelect = document.createElement("select");
    modeText.textContent = "Index data:";
    for (const [key, dataset] of Object.entries(datasets)) {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = dataset.label;
        modeSelect.append(option);
    }
    modeLabel.append(modeText, modeSelect);
    if (toolbar) {
        toolbar.append(modeLabel);
    }

    let markId = null;
    let scales = null;
    let values = null;
    let activeKey = "u32";
    let activeValues = datasets.u32.makeArray();
    let baseStart = datasets.u32.start;
    let baseSpan = datasets.u32.span;

    const buildValues = (values, start, span) => {
        for (let i = 0; i < count; i += 1) {
            const t = count === 1 ? 0 : i / (count - 1);
            values[i] = Math.round(start + t * span);
        }
    };

    const createIndexMark = (key) => {
        const dataset = datasets[key];
        if (!dataset) {
            return;
        }
        activeKey = key;
        baseStart = dataset.start;
        baseSpan = dataset.span;
        activeValues = dataset.makeArray();
        buildValues(activeValues, baseStart, baseSpan);

        if (markId) {
            renderer.destroyMark(markId);
            markId = null;
        }

        const handle = renderer.createMark("point", {
            count,
            channels: {
                x: {
                    data: activeValues,
                    type: "u32",
                    inputComponents: dataset.inputComponents,
                    scale: {
                        type: "index",
                        domain: [baseStart, baseStart + baseSpan],
                        paddingInner: 0,
                        paddingOuter: 0,
                        align: 0,
                        band: 0.5,
                    },
                },
                y: {
                    value: 0,
                    type: "f32",
                    dynamic: true,
                    scale: { type: "identity" },
                },
                size: { value: 120 },
                fill: { value: [0.2, 0.5, 0.8, 1.0] },
                stroke: { value: [0.05, 0.05, 0.1, 1.0] },
                strokeWidth: { value: 1.5 },
            },
        });
        markId = handle.markId;
        scales = handle.scales;
        values = handle.values;

        renderer.updateSeries(markId, { x: activeValues }, count);
        updateRanges({
            width: canvas.width,
            height: canvas.height,
            dpr: window.devicePixelRatio ?? 1,
        });
        renderer.render();
    };

    const padding = 40;

    const updateRanges = ({ width, height }) => {
        if (!markId) {
            return;
        }
        scales.x.setRange([padding, Math.max(padding, width - padding)]);
        values.y.set(height * 0.5);
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    createIndexMark(activeKey);

    let animationFrame = 0;
    let startTime = performance.now();

    const tick = (now) => {
        const t = (now - startTime) / 1000;
        const pan = Math.sin(t * 0.7) * 200;
        const zoom = 1 + 0.35 * Math.sin(t * 0.45);
        const span = baseSpan * zoom;
        const start = baseStart + pan;
        if (markId) {
            scales.x.setDomain([start, start + span]);
            renderer.render();
        }
        animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);

    const onModeChange = (event) => {
        const nextKey = event.target.value;
        if (nextKey === activeKey) {
            return;
        }
        startTime = performance.now();
        createIndexMark(nextKey);
    };
    modeSelect.addEventListener("change", onModeChange);

    return () => {
        cancelAnimationFrame(animationFrame);
        cleanupResize();
        modeSelect.removeEventListener("change", onModeChange);
        if (toolbar && toolbar.contains(modeLabel)) {
            toolbar.removeChild(modeLabel);
        }
        if (markId) {
            renderer.destroyMark(markId);
            markId = null;
            scales = null;
            values = null;
        }
    };
}
