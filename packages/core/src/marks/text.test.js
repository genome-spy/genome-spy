import { describe, expect, test, vi } from "vitest";
import { initializeViewSubtree } from "../data/flowInit.js";
import LayerView from "../view/layerView.js";
import UnitView from "../view/unitView.js";
import { create } from "../view/testUtils.js";
import WebGLTextMark from "../rendering/webgl/marks/text.js";

/**
 * @param {import("../spec/channel.js").PositionDef | import("../spec/channel.js").Position2Def} channelDef
 */
function getBand(channelDef) {
    return /** @type {import("../spec/channel.js").BandMixins} */ (channelDef)
        .band;
}

describe("TextMark", () => {
    test("updates a vector uniform from an expression component", async () => {
        const view = await create(
            {
                params: [{ name: "fadeDistance", value: 4 }],
                data: { values: [{ label: "text" }] },
                mark: "text",
                encoding: { text: { field: "label", type: "nominal" } },
            },
            UnitView
        );
        const textMark = /** @type {any} */ (
            Object.create(WebGLTextMark.prototype)
        );
        textMark.mark = { unitView: view };
        const uniformSetter = vi.fn();
        textMark.markUniformInfo = {
            setters: { uTestVector: uniformSetter },
        };
        const requestRender = vi.spyOn(view.context.animator, "requestRender");

        textMark.registerMarkUniformVector("uTestVector", [
            1,
            { expr: "fadeDistance" },
            3,
            4,
        ]);
        expect(uniformSetter).toHaveBeenLastCalledWith([1, 4, 3, 4]);

        view.paramRuntime.setValue("fadeDistance", 12);

        expect(uniformSetter).toHaveBeenLastCalledWith([1, 12, 3, 4]);
        expect(requestRender).toHaveBeenCalledTimes(2);
    });

    test("defers expression updates until data propagation completes", async () => {
        const view = await create(
            {
                data: { values: [{ label: "text" }] },
                mark: {
                    type: "text",
                    text: { expr: "width" },
                },
            },
            UnitView,
            {},
            { rendererResources: createNoOpRendererResources() }
        );

        view.mark.initializeEncoders();
        initializeViewSubtree(view, view.context.dataFlow);

        const updateGraphicsData = vi
            .spyOn(view.mark, "updateGraphicsData")
            .mockImplementation(() => undefined);

        // Layout expressions can update before the source has completed.
        view.paramRuntime.setValue("width", 100);
        expect(updateGraphicsData).not.toHaveBeenCalled();

        view.getCollector().complete();
        const updatesAfterDataPropagation =
            updateGraphicsData.mock.calls.length;
        view.paramRuntime.setValue("width", 200);

        expect(updateGraphicsData).toHaveBeenCalledTimes(
            updatesAfterDataPropagation + 1
        );
    });

    test("repaints expression updates without rebuilding GPU data in Canvas mode", async () => {
        const view = await create(
            {
                data: { values: [{ label: "text" }] },
                mark: { type: "text", text: { expr: "width" } },
            },
            UnitView,
            {}
        );
        view.mark.initializeEncoders();
        initializeViewSubtree(view, view.context.dataFlow);
        view.getCollector().complete();
        const updateGraphicsData = vi
            .spyOn(view.mark, "updateGraphicsData")
            .mockImplementation(() => undefined);
        const requestRender = vi.spyOn(view.context.animator, "requestRender");

        view.paramRuntime.setValue("width", 200);

        expect(updateGraphicsData).not.toHaveBeenCalled();
        expect(requestRender).toHaveBeenCalled();
    });

    test("requests configured weight from the default font family", async () => {
        const view = await create(
            {
                data: {
                    values: [{ label: "Bold default family" }],
                },
                layer: [
                    {
                        mark: {
                            type: "text",
                            fontWeight: "bold",
                        },
                        encoding: {
                            text: { field: "label", type: "nominal" },
                        },
                    },
                ],
            },
            LayerView
        );

        const textView = /** @type {UnitView} */ (view.children[0]);
        const textMark = /** @type {import("./text.js").default} */ (
            textView.mark
        );

        expect(textMark.font).not.toBe(
            textView.context.fontManager.getDefaultFont()
        );
    });

    test("uses interval edges for ranged index text", async () => {
        const view = await create(
            {
                data: {
                    values: [{ from: 0, to: 2, label: "[0, 2)" }],
                },
                encoding: {
                    x: { field: "from", type: "index" },
                    x2: { field: "to" },
                },
                layer: [
                    {
                        mark: "text",
                        encoding: {
                            text: { field: "label", type: "nominal" },
                        },
                    },
                ],
            },
            LayerView
        );

        const textView = /** @type {UnitView} */ (view.children[0]);
        textView.mark.initializeEncoders();

        // Ranged text on index/band-like scales must use interval edges rather
        // than band centers so the label is centered inside the rect span.
        expect(getBand(textView.mark.encoding.x)).toBe(0);
        expect(getBand(textView.mark.encoding.x2)).toBe(0);
    });

    test("keeps centered band positioning for ranged nominal text", async () => {
        const view = await create(
            {
                data: {
                    values: [{ start: "A", end: "B", label: "A-B" }],
                },
                encoding: {
                    x: { field: "start", type: "nominal" },
                    x2: { field: "end" },
                },
                layer: [
                    {
                        mark: "text",
                        encoding: {
                            text: { field: "label", type: "nominal" },
                        },
                    },
                ],
            },
            LayerView
        );

        const textView = /** @type {UnitView} */ (view.children[0]);
        textView.mark.initializeEncoders();

        expect(getBand(textView.mark.encoding.x)).toBeUndefined();
        expect(getBand(textView.mark.encoding.x2)).toBeUndefined();
    });
});

function createNoOpRendererResources() {
    const delegate = {
        initializeGraphics: /** @returns {void} */ () => undefined,
        finalizeGraphicsInitialization: /** @returns {void} */ () => undefined,
        updateGraphicsData: /** @returns {void} */ () => undefined,
        deleteGraphicsData: /** @returns {void} */ () => undefined,
        dispose: /** @returns {void} */ () => undefined,
        isReady: () => true,
        getDebugState: () => ({
            markUniformsAltered: false,
            rangeCount: 0,
        }),
        prepareRender: /** @returns {Array<() => void>} */ () => [],
        render: /** @returns {undefined} */ () => undefined,
        setViewport: () => true,
    };
    return {
        createMark: () => delegate,
        updateScaleResolution: /** @returns {void} */ () => undefined,
        loadFontResource: () => ({
            resource: /** @type {unknown} */ (undefined),
            ready: Promise.resolve(),
        }),
        dispose: /** @returns {void} */ () => undefined,
    };
}
