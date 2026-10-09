// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("./styles/genome-spy.css.js", () => ({ default: "" }));

import "./rendering/registerCanvas.js";
import "./rendering/registerSvg.js";
import "./rendering/registerWebGL.js";
import GenomeSpy from "./genomeSpyBase.js";
import { createEmbed } from "./embedFactory.js";

const embed = createEmbed(/** @type {any} */ (GenomeSpy));

/** @type {ReturnType<typeof createContext>[]} */
let contexts;
/** @type {string[]} */
let contextTypes;
/** @type {FrameRequestCallback[]} */
let animationFrames;

beforeEach(() => {
    contexts = [];
    contextTypes = [];
    animationFrames = [];
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({
            addEventListener: /** @returns {void} */ () => undefined,
            removeEventListener: /** @returns {void} */ () => undefined,
        }))
    );
    vi.stubGlobal(
        "requestAnimationFrame",
        vi.fn((callback) => {
            animationFrames.push(callback);
            return animationFrames.length;
        })
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        function (type) {
            contextTypes.push(type);
            if (String(type) != "2d") {
                throw new Error("Unexpected GPU context request: " + type);
            }
            const context = createContext(this);
            contexts.push(context);
            return /** @type {any} */ (context);
        }
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
        function (callback, type) {
            callback(new Blob(["png"], { type: type ?? "image/png" }));
        }
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
        "data:image/png;base64,canvas2d"
    );
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

test("keeps a shared data-loading error visible after launch", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn(
            async () =>
                new Response("", { status: 404, statusText: "Not Found" })
        )
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onError = vi.fn();
    const genomeSpy = new GenomeSpy(
        container,
        {
            width: 200,
            height: 100,
            // A root concat owns its shared data without an implicit wrapper.
            data: { url: "missing.csv" },
            vconcat: [{ mark: "point" }, { mark: "point" }],
        },
        { renderer: "canvas", onError }
    );

    try {
        expect(await genomeSpy.launch()).toBe(true);
        expect(onError).not.toHaveBeenCalled();
        expect(
            container.querySelector(".loading-indicators .error")?.textContent
        ).toContain("Could not load data: missing.csv. Reason: 404 Not Found");
    } finally {
        genomeSpy.destroy();
        container.remove();
    }
});

test("reports canonical source outcomes through the embed API until final disposal", async () => {
    const fetchData = vi.fn(
        async () => new Response("", { status: 404, statusText: "Not Found" })
    );
    vi.stubGlobal("fetch", fetchData);
    const container = document.createElement("div");
    const data = { url: "missing.csv" };
    const api = await embed(
        container,
        {
            vconcat: [
                { name: "first", width: 200, height: 100, data, mark: "point" },
                {
                    name: "second",
                    width: 200,
                    height: 100,
                    data: { ...data },
                    mark: "point",
                },
            ],
        },
        {
            renderer: "canvas",
            getSpecOrigin: (fragment) =>
                fragment === data ? "/vconcat/0/data" : undefined,
        }
    );

    try {
        const [entry] = api.dataLoading.getSnapshot();
        expect(api.dataLoading.getSnapshot()).toHaveLength(1);
        expect(entry).toMatchObject({
            status: "error",
            origin: "/vconcat/0/data",
            errorPhase: "request",
        });
        expect(fetchData).toHaveBeenCalledOnce();
        expect(
            container.querySelectorAll(".loading-indicators .error")
        ).toHaveLength(2);
        const changed = vi.fn();
        const unsubscribe = api.dataLoading.subscribe(changed);
        expect(changed).not.toHaveBeenCalled();

        // Removing the canonical source's original owner must preserve its live consumer.
        await api.views.remove(api.views.get({ scope: [], view: "first" }));
        expect(api.dataLoading.getSnapshot()).toEqual([entry]);
        expect(changed).not.toHaveBeenCalled();
        expect(
            container.querySelectorAll(".loading-indicators .error")
        ).toHaveLength(1);

        await api.views.remove(api.views.get({ scope: [], view: "second" }));
        expect(api.dataLoading.getSnapshot()).toEqual([]);
        expect(changed).toHaveBeenCalledExactlyOnceWith({
            type: "remove",
            sourceId: entry.sourceId,
        });
        unsubscribe();
    } finally {
        api.finalize();
    }
    expect(() => api.dataLoading.getSnapshot()).toThrow("finalized embed");
    expect(() => api.dataLoading.subscribe(() => {})).toThrow(
        "finalized embed"
    );
});

test("keeps main and lookup outcomes independent and replaces errors after a new load", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url) =>
            url === "main.csv"
                ? new Response("key\n1")
                : new Response("", { status: 404, statusText: "Not Found" })
        )
    );
    const container = document.createElement("div");
    const api = await embed(
        container,
        {
            width: 200,
            height: 100,
            data: { url: "main.csv" },
            transform: [
                {
                    type: "lookup",
                    from: { url: "side.csv" },
                    key: "key",
                    fields: ["key"],
                    values: ["label"],
                },
            ],
            mark: "point",
        },
        { renderer: "canvas" }
    );

    try {
        expect(
            api.dataLoading
                .getSnapshot()
                .map((entry) => entry.status)
                .sort()
        ).toEqual(["complete", "error"]);
        expect(
            container.querySelector(".loading-indicators .error").textContent
        ).toContain("side.csv");
        const changed = vi.fn();
        api.dataLoading.subscribe(changed);
        const subscriberError = new Error("Host listener failed");
        const report = vi.fn();
        vi.stubGlobal("reportError", report);
        const stopFailing = api.dataLoading.subscribe((change) => {
            if (change.type === "update") change.entry.status = "error";
            throw subscriberError;
        });
        const root = /** @type {import("./view/view.js").default} */ (
            api.debug.getViewRoot()
        );
        const side = root.context.dataFlow.dataSources.find(
            (source) =>
                root.context.dataFlow.loadingStatusRegistry.getSource(source)
                    ?.status === "error"
        );
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async (url) =>
                    new Response(
                        url === "main.csv" ? "key\n1" : "key,label\n1,A"
                    )
            )
        );
        await side.load();
        await vi.waitFor(() =>
            expect(
                api.dataLoading
                    .getSnapshot()
                    .every((entry) => entry.status === "complete")
            ).toBe(true)
        );
        stopFailing();
        expect(report).toHaveBeenCalledWith(subscriberError);
        const sideId =
            root.context.dataFlow.loadingStatusRegistry.getSource(
                side
            ).sourceId;
        const updates = changed.mock.calls
            .map(([change]) => change)
            .filter((change) => change.entry.sourceId === sideId);
        expect(updates.map((change) => change.entry.status)).toEqual([
            "loading",
            "complete",
        ]);
        expect(updates[1].entry).not.toHaveProperty("message");
        expect(updates[1].entry).not.toHaveProperty("errorPhase");
        expect(
            container.querySelector(".loading-indicators .error")
        ).toBeNull();

        // Public entries are detached from the source of truth and other listeners.
        const snapshot = api.dataLoading.getSnapshot();
        snapshot[0].status = "error";
        expect(
            api.dataLoading
                .getSnapshot()
                .every((entry) => entry.status === "complete")
        ).toBe(true);
        changed.mockClear();
        api.finalize();
        expect(changed).not.toHaveBeenCalled();
    } finally {
        api.finalize();
    }
});

test.each([
    {
        phase: "row propagation",
        transform: [
            { type: "formula", expr: "datum.absent.value", as: "value" },
        ],
    },
    {
        phase: "completion",
        transform: [{ type: "aggregate", fields: ["missing"], ops: ["sum"] }],
    },
])("reports $phase failures as processing errors", async ({ transform }) => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("value\n1"))
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const api = await embed(
        document.createElement("div"),
        {
            width: 200,
            height: 100,
            data: { url: "valid.csv" },
            transform:
                /** @type {import("./spec/transform.js").TransformParams[]} */ (
                    transform
                ),
            mark: "point",
        },
        { renderer: "canvas" }
    );
    try {
        expect(api.dataLoading.getSnapshot()[0]).toMatchObject({
            status: "error",
            errorPhase: "processing",
        });
        const root = /** @type {import("./view/view.js").default} */ (
            api.debug.getViewRoot()
        );
        const [source] = root.context.dataFlow.dataSources;
        const outcomes = vi.fn();
        api.dataLoading.subscribe(outcomes);
        await source.load();
        expect(
            outcomes.mock.calls.map(([change]) => change.entry.status)
        ).toEqual(["loading", "error"]);
    } finally {
        api.finalize();
    }
});

test("launches, updates expressions, and repaints interactions without a GPU context", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const genomeSpy = new GenomeSpy(
        container,
        {
            width: 200,
            height: 100,
            padding: 0,
            params: [{ name: "offset", value: 0 }],
            data: {
                values: [
                    { x: 0.25, x2: 0.45 },
                    { x: 0.55, x2: 0.75 },
                ],
            },
            layer: [
                {
                    mark: "rect",
                    encoding: {
                        x: {
                            field: "x",
                            type: "quantitative",
                            scale: {
                                domain: [0, 1],
                                name: "canvas-x",
                                zoom: { extent: "unbounded" },
                            },
                            axis: null,
                        },
                        x2: { field: "x2" },
                        y: { value: 0.1 },
                        y2: { value: 0.4 },
                        fill: { value: "#123456" },
                    },
                },
                {
                    mark: {
                        type: "point",
                        xOffset: { expr: "offset" },
                    },
                    encoding: {
                        x: {
                            field: "x",
                            type: "quantitative",
                            scale: {
                                domain: [0, 1],
                                zoom: { extent: "unbounded" },
                            },
                            axis: null,
                        },
                        y: { value: 0.7 },
                        size: { value: 100 },
                        fill: { value: "#abcdef" },
                    },
                },
                {
                    mark: "rule",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        x2: { field: "x2" },
                        y: { value: 0.45 },
                        y2: { value: 0.55 },
                        color: { value: "#334455" },
                        size: { value: 2 },
                    },
                },
                {
                    mark: { type: "link", linkShape: "diagonal" },
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        x2: { field: "x2" },
                        y: { value: 0.2 },
                        y2: { value: 0.8 },
                        color: { value: "#556677" },
                        size: { value: 2 },
                    },
                },
                {
                    mark: "text",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { value: 0.9 },
                        text: { value: "A" },
                        color: { value: "#112233" },
                        size: { value: 12 },
                    },
                },
                {
                    mark: "arrow",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        x2: { field: "x2" },
                        y: { value: 0.6 },
                        y2: { value: 0.6 },
                        fill: { value: "#778899" },
                        size: { value: 4 },
                    },
                },
            ],
        },
        { renderer: "canvas" }
    );

    expect(await genomeSpy.launch()).toBe(true);
    genomeSpy.renderAll();

    expect(contextTypes).toEqual(["2d", "2d"]);
    expect(contexts).toHaveLength(2);
    expect(contexts[0].fillRect).toHaveBeenCalled();
    expect(contexts[0].arc).toHaveBeenCalledTimes(2);
    expect(contexts[0].bezierCurveTo).toHaveBeenCalledTimes(2);
    expect(contexts[0].fillText).toHaveBeenCalledTimes(2);
    expect(contexts[0].closePath).toHaveBeenCalled();
    expect(container.querySelectorAll("canvas")).toHaveLength(1);

    expect(() => genomeSpy.getParam("offset").setValue(5)).not.toThrow();
    flushAnimationFrames(2);

    const canvas = container.querySelector("canvas");
    if (!canvas) {
        throw new Error("Canvas surface was not created.");
    }
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
        /** @type {DOMRect} */ (
            /** @type {unknown} */ ({
                left: 0,
                top: 0,
                width: 200,
                height: 100,
            })
        )
    );
    const xScale = genomeSpy.getNamedScaleResolutions().get("canvas-x");
    if (!xScale) {
        throw new Error("Named Canvas scale was not created.");
    }
    const initialDomain = xScale.getDomain().slice();
    const initialPaints = contexts[0].fillRect.mock.calls.length;

    canvas.dispatchEvent(
        new WheelEvent("wheel", {
            clientX: 100,
            clientY: 50,
            deltaY: 60,
            cancelable: true,
        })
    );
    flushAnimationFrames(4);

    expect(xScale.getDomain()).not.toEqual(initialDomain);
    expect(contexts[0].fillRect.mock.calls.length).toBeGreaterThan(
        initialPaints
    );

    const wheelDomain = xScale.getDomain().slice();
    const wheelPaints = contexts[0].fillRect.mock.calls.length;
    canvas.dispatchEvent(
        new MouseEvent("mousedown", {
            button: 0,
            buttons: 1,
            clientX: 100,
            clientY: 50,
            bubbles: true,
        })
    );
    document.dispatchEvent(
        new MouseEvent("mousemove", {
            buttons: 1,
            clientX: 120,
            clientY: 50,
            bubbles: true,
        })
    );
    document.dispatchEvent(
        new MouseEvent("mouseup", {
            button: 0,
            clientX: 120,
            clientY: 50,
            bubbles: true,
        })
    );
    flushAnimationFrames(2);

    expect(xScale.getDomain()).not.toEqual(wheelDomain);
    expect(contexts[0].fillRect.mock.calls.length).toBeGreaterThan(wheelPaints);

    genomeSpy.destroy();
});

test("falls back automatically, picks data, updates live state, and exports", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let showHidden = false;
    const genomeSpy = new GenomeSpy(container, {
        width: 80,
        height: 40,
        padding: 0,
        datasets: { values: [{ x: 0.2, x2: 0.4 }] },
        layer: [
            {
                name: "dynamic",
                data: { name: "values" },
                mark: { type: "rect", tooltip: false },
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 1] },
                        axis: null,
                    },
                    x2: { field: "x2" },
                    y: { value: 0.1 },
                    y2: { value: 0.4 },
                    fill: { value: "#123456" },
                },
            },
            {
                name: "initially-hidden",
                visible: false,
                data: { values: [{}] },
                mark: "rect",
                encoding: {
                    x: { value: 0.5 },
                    x2: { value: 0.8 },
                    y: { value: 0.6 },
                    y2: { value: 0.9 },
                    fill: { value: "#abcdef" },
                },
            },
        ],
    });
    genomeSpy.viewVisibilityPredicate = (view) =>
        showHidden || view.isVisibleInSpec();

    expect(await genomeSpy.launch()).toBe(true);
    genomeSpy.renderAll();

    expect(contextTypes).toContain("webgl2");
    expect(contextTypes.filter((type) => type == "2d")).toHaveLength(2);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Canvas2D compatibility renderer")
    );

    const canvas = container.querySelector("canvas");
    if (!canvas) {
        throw new Error("Canvas surface was not created.");
    }
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
        /** @type {DOMRect} */ (
            /** @type {unknown} */ ({
                left: 0,
                top: 0,
                width: 80,
                height: 40,
            })
        )
    );
    const click = vi.fn();
    genomeSpy.addEventListener("click", click);

    canvas.dispatchEvent(
        new MouseEvent("mousemove", {
            clientX: 20,
            clientY: 30,
            bubbles: true,
        })
    );
    flushAnimationFrames(2);
    expect(() => {
        canvas.dispatchEvent(
            new MouseEvent("mousedown", {
                button: 0,
                buttons: 1,
                clientX: 20,
                clientY: 30,
                bubbles: true,
            })
        );
        canvas.dispatchEvent(
            new MouseEvent("mouseup", {
                button: 0,
                clientX: 20,
                clientY: 30,
                bubbles: true,
            })
        );
        canvas.dispatchEvent(
            new MouseEvent("click", {
                clientX: 20,
                clientY: 30,
                bubbles: true,
            })
        );
    }).not.toThrow();
    expect(click).toHaveBeenCalledWith(
        expect.objectContaining({
            type: "click",
            viewPath: expect.arrayContaining(["dynamic"]),
            datum: expect.objectContaining({ x: 0.2, x2: 0.4 }),
        })
    );
    expect(contextTypes.filter((type) => type == "2d")).toHaveLength(2);

    contexts[0].fillRect.mockClear();
    genomeSpy.updateNamedData("values", [
        { x: 0.1, x2: 0.2 },
        { x: 0.7, x2: 0.9 },
    ]);
    flushAnimationFrames(2);
    expect(contexts[0].fillRect.mock.calls).toContainEqual([
        expect.closeTo(7.9),
        expect.closeTo(23.9),
        expect.closeTo(8.2),
        expect.closeTo(12.2),
    ]);
    expect(contexts[0].fillRect.mock.calls).toContainEqual([
        expect.closeTo(55.9),
        expect.closeTo(23.9),
        expect.closeTo(16.2),
        expect.closeTo(12.2),
    ]);
    expect(contexts[0].fillRect.mock.calls).not.toContainEqual([
        expect.closeTo(15.9),
        expect.closeTo(23.9),
        expect.closeTo(16.2),
        expect.closeTo(12.2),
    ]);

    contexts[0].fillRect.mockClear();
    showHidden = true;
    await genomeSpy.initializeVisibleViewData();
    flushAnimationFrames(2);
    expect(contexts[0].fillRect.mock.calls).toContainEqual([
        expect.closeTo(39.9),
        expect.closeTo(3.9),
        expect.closeTo(24.2),
        expect.closeTo(12.2),
    ]);

    const { blob } = await genomeSpy.exportRaster({
        logicalWidth: 40,
        logicalHeight: 20,
        pixelRatio: 2,
        background: null,
    });
    expect(blob.type).toBe("image/png");
    expect(contextTypes.filter((type) => type == "2d")).toHaveLength(3);
    expect(contexts[2].canvas.width).toBe(80);
    expect(contexts[2].canvas.height).toBe(40);
    expect(genomeSpy.exportCanvas()).toBe("data:image/png;base64,canvas2d");
    expect(contextTypes.filter((type) => type == "2d")).toHaveLength(4);

    const gpuContextRequests = contextTypes.filter(
        (type) => type != "2d"
    ).length;
    const svgResult = await genomeSpy.exportSvg({
        logicalWidth: 40,
        logicalHeight: 20,
        background: null,
        rasterization: { maxVectorInstances: 0, pixelRatio: 2 },
    });
    expect(svgResult.blob.type).toBe("image/svg+xml");
    expect(svgResult.warnings).toEqual([]);
    expect(svgResult.rasterized).toEqual([
        {
            targets: [{ markType: "rect", instanceCount: 1 }],
            reason: "instance-threshold",
            maxVectorInstances: 0,
            pixelRatio: 2,
        },
    ]);
    expect(contexts[4].canvas.width).toBe(80);
    expect(contexts[4].canvas.height).toBe(40);
    expect(contexts[5].drawImage).toHaveBeenCalledOnce();
    expect(contextTypes.filter((type) => type != "2d")).toHaveLength(
        gpuContextRequests
    );

    genomeSpy.destroy();
    warn.mockRestore();
});

/** @param {number} count */
function flushAnimationFrames(count) {
    const start = performance.now();
    for (let i = 0; i < count; i++) {
        const callbacks = animationFrames.splice(0);
        for (const callback of callbacks) {
            callback(start + (i + 1) * 16);
        }
    }
}

/** @param {HTMLCanvasElement} canvas */
function createContext(canvas) {
    return {
        canvas,
        fillStyle: "#000000",
        strokeStyle: "#000000",
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        lineWidth: 1,
        lineCap: "butt",
        lineJoin: "miter",
        lineDashOffset: 0,
        font: "",
        textAlign: "start",
        textBaseline: "alphabetic",
        resetTransform: vi.fn(),
        clearRect: vi.fn(),
        setTransform: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        bezierCurveTo: vi.fn(),
        closePath: vi.fn(),
        setLineDash: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        measureText: vi.fn(() => ({ width: 1 })),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
    };
}
