// @vitest-environment jsdom
import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { createAndInitialize, renderToLayout } from "./testUtils.js";
import ConcatView from "./concatView.js";
import FacetView from "./facetView.js";
import UnitView from "./unitView.js";
import Point from "./layout/point.js";
import Rectangle from "./layout/rectangle.js";
import InteractionDispatcher from "../genomeSpy/interactionDispatcher.js";
import InteractionController from "../genomeSpy/interactionController.js";
import DebuggingViewRenderingContext from "./renderingContext/debuggingViewRenderingContext.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import Tooltip from "../utils/ui/tooltip.js";
import { createViewMutationApi } from "./viewMutationApi.js";

afterEach(() => vi.restoreAllMocks());

/** @param {"x" | "y"} [channel] @param {boolean} [zoom]
 * @returns {import("../spec/view.js").UnitSpec["encoding"]} */
function encoding(channel = "x", zoom = true) {
    return {
        [channel]: {
            field: "x",
            type: "quantitative",
            axis: null,
            scale: { domain: [0, 10], zoom },
        },
    };
}

/** @param {Omit<Partial<import("../spec/view.js").FacetSpec>, "spec"> & {spec?: Partial<import("../spec/view.js").UnitSpec & import("../spec/view.js").LayerSpec>}} [overrides] @param {boolean} [enclosingViewport] */
async function createFacet(overrides = {}, enclosingViewport = false) {
    const spec = {
        data: {
            values: [
                { g: "A", row: 1, x: 2 },
                { g: "B", row: 1, x: 8 },
                { g: "C", row: 2, x: 5 },
            ],
        },
        facet: { field: "g" },
        columns: 2,
        ...overrides,
        spec: {
            width: 100,
            height: 60,
            ...("layer" in (overrides.spec ?? {}) ? {} : { mark: "point" }),
            encoding: encoding(),
            ...overrides.spec,
        },
    };
    const root = await createAndInitialize(
        /** @type {any} */ ({
            vconcat: [
                enclosingViewport
                    ? { viewportHeight: 55, vconcat: [spec] }
                    : spec,
            ],
        }),
        ConcatView
    );
    onTestFinished(() => root.disposeSubtree());
    renderToLayout(root);
    const facet = /** @type {FacetView} */ (
        root.getDescendants().find((v) => v instanceof FacetView)
    );
    return {
        root,
        facet,
        child: facet.child,
        dispatcher: new InteractionDispatcher({ viewRoot: root }),
    };
}

/** @param {Rectangle} rect @param {number} [x] @param {number} [y] */
const pointIn = (rect, x = 0.5, y = 0.5) =>
    new Point(rect.x + rect.width * x, rect.y + rect.height * y);
/** @param {string} type @param {Point} point */
const mouse = (type, point) =>
    new MouseEvent(type, { clientX: point.x, clientY: point.y });

// The same datum can occur in several cells: picking/hover must retain the occurrence identity.
test.each([false, true])(
    "picking and tooltips identify the cell (child-owned data: %s)",
    async (ownData) => {
        const { root, facet, child } = await createFacet({
            spec: {
                ...(ownData ? { data: { values: [{ x: 5 }] } } : {}),
                mark: { type: "point", tooltip: { handler: "cell" } },
            },
        });
        const unit = /** @type {UnitView} */ (child);
        const canvas = document.createElement("canvas");
        Object.defineProperties(canvas, {
            clientWidth: { value: 1000 },
            clientHeight: { value: 1000 },
        });
        const container = document.createElement("div");
        const tooltip = new Tooltip(container);
        tooltip.mouseCoords = [0, 0];
        let pickedId = 0;
        const controller = new InteractionController({
            viewRoot: root,
            canvas,
            tooltip,
            animator: root.context.animator,
            emitEvent() {},
            tooltipHandlers: {
                cell: async (datum, mark, params, context) =>
                    `${context.facetId[0]}: ${datum.x}`,
            },
            renderPickingFramebuffer() {},
            readPickingId: () => pickedId,
        });
        vi.spyOn(root.context, "getCurrentHover").mockImplementation(() =>
            controller.getCurrentHover()
        );
        const now = vi.spyOn(performance, "now").mockReturnValue(0);
        onTestFinished(controller.registerInteractionEvents());
        now.mockReturnValue(1000);
        vi.spyOn(tooltip, "handleMouseMove").mockImplementation(() => {});
        const hover = vi.fn();
        controller.subscribeHover(facet, hover);
        const api = createViewMutationApi({
            viewRoot: root,
            pick: controller.pick.bind(controller),
        });
        const rows = Array.from(unit.getCollector().getData());
        for (const g of ["A", "B"]) {
            const datum = ownData ? rows[0] : rows.find((d) => d.g === g);
            pickedId = datum[UNIQUE_ID_KEY];
            const point = pointIn(child.facetCoords.get([g]));
            expect(await api.root().marks.pick(point)).toMatchObject({
                status: "hit",
                hit: { datum: { x: datum.x }, facetId: [g] },
            });
            canvas.dispatchEvent(mouse("mousemove", point));
            await vi.waitFor(() =>
                expect(container.textContent).toBe(`${g}: ${datum.x}`)
            );
            expect(hover.mock.lastCall[0]).toMatchObject({
                datum,
                facetId: [g],
            });
        }
        expect(hover).toHaveBeenCalledTimes(3);
        expect(await controller.pick(new Point(105, 30))).toEqual({
            status: "empty",
        });
    }
);

test("layers capture and bubble once and honor stopPropagation", async () => {
    const { root, facet, child, dispatcher } = await createFacet({
        spec: {
            layer: [
                { name: "bottom", mark: "point" },
                { name: "top", mark: "point" },
            ],
        },
    });
    const layer = /** @type {import("./layerView.js").default} */ (child);
    /** @type {unknown[]} */
    const calls = [];
    for (const view of [root, facet, child, ...layer.children]) {
        for (const capture of [true, false])
            view.addInteractionListener(
                "click",
                (e) => calls.push([view.name, capture, e.facetId]),
                capture
            );
    }
    const point = pointIn(child.facetCoords.get(["C"]));
    expect(dispatcher.dispatch(point, mouse("click", point)).target).toBe(
        layer.children[0]
    );
    expect(calls).toEqual([
        [root.name, true, undefined],
        [facet.name, true, undefined],
        [child.name, true, ["C"]],
        ["top", true, ["C"]],
        ["top", false, ["C"]],
        ["bottom", true, ["C"]],
        ["bottom", false, ["C"]],
        [child.name, false, ["C"]],
        [facet.name, false, ["C"]],
        [root.name, false, ["C"]],
    ]);
    calls.length = 0;
    layer.children[1].addInteractionListener(
        "click",
        (e) => e.stopPropagation(),
        true
    );
    dispatcher.dispatch(point, mouse("click", point));
    expect(calls).toHaveLength(4);
});

test("tuple cell transitions survive reflow without leaving the facet container", async () => {
    const { root, facet, child, dispatcher } = await createFacet({
        facet: { row: { field: "row" }, column: { field: "g" } },
        columns: undefined,
    });
    /** @type {unknown[]} */
    const calls = [];
    for (const view of [facet, child])
        for (const type of ["mouseenter", "mouseleave"])
            view.addInteractionListener(type, (e) =>
                calls.push([view.name, type, e.facetId])
            );
    const first = pointIn(child.facetCoords.get([1, "B"]));
    dispatcher.dispatch(first, mouse("mousemove", first));
    facet.invalidateSizeCache();
    renderToLayout(root);
    dispatcher.dispatch(first, mouse("mousemove", first));
    expect(calls).toHaveLength(2);
    const second = pointIn(child.facetCoords.get([2, "C"]));
    dispatcher.dispatch(second, mouse("mousemove", second));
    dispatcher.handlePointerLeave(new MouseEvent("mouseleave"));
    expect(calls).toEqual([
        [facet.name, "mouseenter", undefined],
        [child.name, "mouseenter", [1, "B"]],
        [child.name, "mouseleave", [1, "B"]],
        [child.name, "mouseenter", [2, "C"]],
        [child.name, "mouseleave", [2, "C"]],
        [facet.name, "mouseleave", undefined],
    ]);
});

test.each(/** @type {const} */ (["click", "mouseover"]))(
    "point selection follows the pointed cell on %s",
    async (on) => {
        const { child, dispatcher } = await createFacet({
            spec: {
                params: [
                    {
                        name: "chosen",
                        select: { type: "point", on, toggle: false },
                    },
                ],
            },
        });
        const unit = /** @type {UnitView} */ (child);
        const hover = vi.spyOn(child.context, "getCurrentHover");
        for (const datum of Array.from(unit.getCollector().getData()).slice(
            0,
            2
        )) {
            hover.mockReturnValue({ mark: unit.mark, datum });
            const point = pointIn(child.facetCoords.get([datum.g]));
            dispatcher.dispatch(
                point,
                mouse(on === "mouseover" ? "mousemove" : on, point)
            );
            expect(child.paramRuntime.findValue("chosen").datum).toBe(datum);
        }
        dispatcher.handlePointerLeave(new MouseEvent("mouseleave"));
        expect(child.paramRuntime.findValue("chosen").datum?.g).toBe(
            on === "mouseover" ? undefined : "B"
        );
    }
);

test("headers, gaps and clipped areas do not target the child", async () => {
    const { facet, child } = await createFacet();
    const second = child.facetCoords.get(["B"]);
    facet.arrange(new DebuggingViewRenderingContext({}), facet.coords, {
        firstFacet: true,
        clipRect: Rectangle.create(0, 0, second.x + 40, second.y + 25),
    });
    const dispatcher = new InteractionDispatcher({ viewRoot: facet });
    const inside = new Point(second.x + 30, second.y + 2);
    expect(dispatcher.dispatch(inside, mouse("click", inside)).target).toBe(
        child
    );
    expect(
        facet.getZoomCoords(new Point(second.x + 60, second.y + 2))
    ).toBeUndefined();
    for (const point of [
        new Point(second.x + 30, second.y + 35),
        new Point(second.x + 60, second.y + 2),
        new Point(second.x - 5, second.y + 2),
        new Point(50, second.y - 5),
        new Point(50, 5),
    ]) {
        expect(
            dispatcher.dispatch(point, mouse("click", point)).target
        ).toBeUndefined();
    }
});

test.each([false, true])(
    "brush uses its starting cell projection and cancels on disposal (remove: %s)",
    async (remove) => {
        const { root, facet, child, dispatcher } = await createFacet({
            params: [
                {
                    name: "brush",
                    select: { type: "interval", encodings: ["x"] },
                },
            ],
            spec: { encoding: encoding("x", false) },
        });
        const rect = child.facetCoords.get(["B"]);
        const start = pointIn(rect, 0.2),
            end = pointIn(rect, 0.6);
        dispatcher.dispatch(start, mouse("mousedown", start));
        document.dispatchEvent(mouse("mousemove", end));
        document.dispatchEvent(new MouseEvent("mouseup"));
        expect(child.paramRuntime.findValue("brush").intervals.x).toEqual([
            2, 6,
        ]);
        const resume = vi.spyOn(root.context, "resumeHoverTracking");
        dispatcher.dispatch(start, mouse("mousedown", start));
        if (remove) root.removeChildView(facet);
        else root.disposeSubtree();
        document.dispatchEvent(mouse("mousemove", pointIn(rect, 1.2)));
        document.dispatchEvent(new MouseEvent("mouseup"));
        expect(resume).toHaveBeenCalledOnce();
    }
);

test.each([false, true])(
    "ruler updates once per cell and clears on leave (child-owned: %s)",
    async (own) => {
        const params = [{ name: "cursor", ruler: { snap: false } }];
        const { facet, child, dispatcher } = await createFacet({
            params: own ? [] : params,
            spec: { params: own ? params : [] },
        });
        const owner = own ? child : facet;
        const set = vi.spyOn(owner.paramRuntime, "setValue");
        for (const g of ["B", "C"]) {
            set.mockClear();
            const point = pointIn(child.facetCoords.get([g]), 0.2);
            dispatcher.dispatch(point, mouse("mousemove", point));
            expect(set).toHaveBeenCalledOnce();
            expect(owner.paramRuntime.findValue("cursor").values.x).toBeCloseTo(
                2
            );
        }
        dispatcher.handlePointerLeave(new MouseEvent("mouseleave"));
        expect(owner.paramRuntime.findValue("cursor").values.x).toBeNull();
    }
);

test("a ruler drag remains anchored outside its starting cell", async () => {
    const { facet, child, dispatcher } = await createFacet({
        params: [{ name: "cursor", ruler: { on: "mousedown", snap: false } }],
    });
    const rect = child.facetCoords.get(["B"]);
    const start = pointIn(rect, 0.2);
    dispatcher.dispatch(start, mouse("mousedown", start));
    document.dispatchEvent(mouse("mousemove", pointIn(rect, 1.2)));
    expect(facet.paramRuntime.findValue("cursor").values.x).toBeCloseTo(12);
    document.dispatchEvent(new MouseEvent("mouseup"));
});

test("layered shared-scale wheel, touch and pan use cell coordinates once and cancel on disposal", async () => {
    const { root, child, dispatcher } = await createFacet({
        facet: { field: "g", sort: ["C", "B", "A"], header: null },
        spacing: { row: 3, column: 17 },
        spec: { layer: [{ mark: "point" }, { mark: "point" }] },
    });
    const resolution = child.getScaleResolution("x");
    const zoom = vi.spyOn(resolution, "zoom");
    const point = pointIn(child.facetCoords.get(["B"]), 0.25);
    const unit = /** @type {UnitView} */ (
        child.getDescendants().find((v) => v instanceof UnitView)
    );
    vi.spyOn(child.context, "getCurrentHover").mockReturnValue({
        mark: unit.mark,
        datum: Array.from(unit.getCollector().getData())[0],
        facetId: ["A"],
    });
    expect(
        dispatcher.dispatch(point, { type: "wheelclaimprobe" }).wheelClaimed
    ).toBe(true);
    expect(zoom).not.toHaveBeenCalled();
    const wheel = new WheelEvent("wheel", { deltaY: -300, cancelable: true });
    dispatcher.dispatch(point, wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(zoom).toHaveBeenCalledExactlyOnceWith(0.5, 0.25, 0);
    expect(resolution.getDomain()).toEqual([1.25, 6.25]);
    dispatcher.dispatch(point, {
        type: "touchgesture",
        phase: "move",
        pointerCount: 2,
        xDelta: 10,
        yDelta: 0,
        zDelta: 0,
    });
    expect(zoom).toHaveBeenLastCalledWith(1, 0.25, expect.closeTo(0.1));
    expect(resolution.getDomain()).toEqual([
        expect.closeTo(0.75),
        expect.closeTo(5.75),
    ]);
    zoom.mockClear();
    const resume = vi.spyOn(root.context, "resumeHoverTracking");
    dispatcher.dispatch(point, mouse("mousedown", point));
    document.dispatchEvent(
        mouse("mousemove", new Point(point.x - 10, point.y))
    );
    expect(zoom).toHaveBeenCalledExactlyOnceWith(1, 0.25, expect.closeTo(-0.1));
    root.disposeSubtree();
    document.dispatchEvent(
        mouse("mousemove", new Point(point.x - 20, point.y))
    );
    expect(zoom).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
});

test.each(/** @type {const} */ (["row", "column"]))(
    "%s facet gaps support shared-scale navigation without targeting a cell",
    async (dimension) => {
        const channel = dimension === "row" ? "x" : "y";
        const { facet, child, dispatcher } = await createFacet({
            facet: { [dimension]: { field: "g", header: null } },
            columns: undefined,
            spacing: 14,
            spec: { encoding: encoding(channel) },
        });
        const a = child.facetCoords.get(["A"]);
        const b = child.facetCoords.get(["B"]);
        const gap =
            dimension === "row"
                ? new Point(a.x + 25, (a.y2 + b.y) / 2)
                : new Point((a.x2 + b.x) / 2, a.y + 15);
        expect(facet.getInteractionCell(gap)).toBeUndefined();
        expect(
            dispatcher.dispatch(gap, mouse("click", gap)).target
        ).toBeUndefined();
        expect(
            dispatcher.dispatch(gap, { type: "wheelclaimprobe" }).wheelClaimed
        ).toBe(true);

        const resolution = child.getScaleResolution(channel);
        const wheel = new WheelEvent("wheel", {
            deltaY: -300,
            cancelable: true,
        });
        dispatcher.dispatch(gap, wheel);
        expect(wheel.defaultPrevented).toBe(true);
        expect(resolution.getDomain()).toEqual(
            channel === "x" ? [1.25, 6.25] : [3.75, 8.75]
        );

        const zoom = vi.spyOn(resolution, "zoom");
        dispatcher.dispatch(gap, mouse("mousedown", gap));
        document.dispatchEvent(
            mouse("mousemove", new Point(gap.x + 10, gap.y + 6))
        );
        expect(zoom).toHaveBeenCalledExactlyOnceWith(
            1,
            channel === "x" ? 0.25 : 0.75,
            expect.closeTo(channel === "x" ? 0.1 : -0.1)
        );
        document.dispatchEvent(new MouseEvent("mouseup"));
    }
);

test("wrapped gaps clamp zoom anchors to the nearest plot edge", async () => {
    const { child, dispatcher } = await createFacet({
        facet: { field: "g", header: null },
        spacing: 14,
        spec: { encoding: { ...encoding("x"), ...encoding("y") } },
    });
    const a = child.facetCoords.get(["A"]);
    const b = child.facetCoords.get(["B"]);
    const gap = new Point((a.x2 + b.x) / 2, a.y + 15);
    dispatcher.dispatch(gap, new WheelEvent("wheel", { deltaY: -300 }));
    expect(child.getScaleResolution("x").getDomain()).toEqual([5, 10]);
    expect(child.getScaleResolution("y").getDomain()).toEqual([3.75, 8.75]);
});

test("zoom in a partly clipped cell uses its full plot height", async () => {
    const { facet, child, dispatcher } = await createFacet({
        viewportHeight: 80,
        columns: 1,
        spec: { encoding: encoding("y") },
    });
    const cell = facet.getInteractionCell(pointIn(child.coords, 0.5, 0.2));
    expect(cell.childCoords.height).toBe(60);
    expect(child.coords.height).toBeLessThan(60);
    const zoom = vi.spyOn(child.getScaleResolution("y"), "zoom");
    dispatcher.dispatch(
        pointIn(cell.childCoords, 0.5, 0.25),
        new WheelEvent("wheel", { deltaY: -300 })
    );
    expect(zoom).toHaveBeenCalledExactlyOnceWith(0.5, 0.75, expect.closeTo(0));
});

test.each([false, true])(
    "scrolling updates cell routing without layout (enclosing viewport: %s)",
    async (enclosing) => {
        const { root, facet, child, dispatcher } = await createFacet(
            { columns: 1, ...(enclosing ? {} : { viewportHeight: 55 }) },
            enclosing
        );
        const scrollbar =
            /** @type {import("./gridView/scrollbar.js").default} */ (
                root
                    .getDescendants()
                    .find((v) => v.name === "scrollbar-vertical")
            );
        expect(child.facetCoords.get(["B"]).height).toBeLessThan(0);
        const reflow = vi.spyOn(root.context, "requestLayoutReflow");
        const header = root
            .getDescendants()
            .find((v) => v.name.startsWith("facetHeader"));
        const title = root
            .getDescendants()
            .find((v) => v.name.startsWith("facetTitle"));
        const headerY = header.layoutCoords.y;
        const titleY = title.layoutCoords.y;
        if (!enclosing) {
            const start = pointIn(child.coords);
            dispatcher.dispatch(start, mouse("mousedown", start));
            document.dispatchEvent(
                mouse("mousemove", new Point(start.x, start.y - 20))
            );
            document.dispatchEvent(new MouseEvent("mouseup"));
            expect(scrollbar.viewportOffset).toBe(20);
            expect(child.getScaleResolution("x").getDomain()).toEqual([0, 10]);
        }
        // Leave a visible gap just below the partly clipped first cell.
        scrollbar.setViewportOffset(70);
        const a = child.facetCoords.get(["A"]);
        const gap = new Point(a.x + a.width / 4, a.y2 + 2);
        expect(facet.getInteractionCell(gap)).toBeUndefined();
        expect(
            dispatcher.dispatch(gap, { type: "wheelclaimprobe" }).wheelClaimed
        ).toBe(true);
        dispatcher.dispatch(gap, new WheelEvent("wheel", { deltaY: -300 }));
        expect(child.getScaleResolution("x").getDomain()).toEqual([1.25, 6.25]);

        scrollbar.setViewportOffset(100);
        const point = pointIn(child.facetCoords.get(["B"]));
        const event = dispatcher.dispatch(point, mouse("click", point));
        expect(event.target).toBe(child);
        expect(event.facetId).toEqual(["B"]);
        expect(header.layoutCoords.y).toBe(headerY - 100);
        expect(title.layoutCoords.y).toBe(titleY - 100);
        expect(reflow).not.toHaveBeenCalled();
    }
);
