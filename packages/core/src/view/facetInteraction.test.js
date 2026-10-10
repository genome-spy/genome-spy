// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { createAndInitialize, renderToLayout } from "./testUtils.js";
import ConcatView from "./concatView.js";
import Point from "./layout/point.js";
import Rectangle from "./layout/rectangle.js";
import InteractionDispatcher from "../genomeSpy/interactionDispatcher.js";
import DebuggingViewRenderingContext from "./renderingContext/debuggingViewRenderingContext.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import InteractionController from "../genomeSpy/interactionController.js";
import Tooltip from "../utils/ui/tooltip.js";
import { createViewMutationApi } from "./viewMutationApi.js";

/** @type {ConcatView[]} */
const roots = [];
/** @type {(() => void)[]} */
const disposers = [];
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose());
    roots.forEach((root) => root.disposeSubtree());
    roots.length = 0;
    vi.restoreAllMocks();
});

test.each([false, true])(
    "picking and tooltips retain the pointed cell (child-owned data: %s)",
    async (ownData) => {
        const { root, facet, child } = await createFacet({
            spec: {
                width: 100,
                height: 60,
                ...(ownData
                    ? { data: { values: [{ label: "repeated", x: 5 }] } }
                    : {}),
                mark: { type: "point", tooltip: { handler: "cell" } },
            },
        });
        const unit = /** @type {import("./unitView.js").default} */ (child);
        const canvas = document.createElement("canvas");
        Object.defineProperties(canvas, {
            clientWidth: { value: 1000 },
            clientHeight: { value: 1000 },
        });
        const tooltipContainer = document.createElement("div");
        const tooltip = new Tooltip(tooltipContainer);
        tooltip.mouseCoords = [0, 0];
        const rows = Array.from(unit.getCollector().getData());
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
        disposers.push(controller.registerInteractionEvents());
        now.mockReturnValue(1000);
        // Tooltip movement penalties are orthogonal to cell picking/content.
        vi.spyOn(tooltip, "handleMouseMove").mockImplementation(() => {});
        const hover = vi.fn();
        controller.subscribeHover(facet, hover);
        const api = createViewMutationApi({
            viewRoot: root,
            pick: controller.pick.bind(controller),
        });
        for (const g of ["A", "B"]) {
            const datum = ownData ? rows[0] : rows.find((row) => row.g === g);
            pickedId = datum[UNIQUE_ID_KEY];
            const point = pointIn(child.facetCoords.get([g]));
            const hit = await controller.pick(point, facet);
            expect(hit).toMatchObject({
                status: "hit",
                hit: { datum, facetId: [g] },
            });
            const publicPick = await api.root().marks.pick(point);
            expect(publicPick).toMatchObject({
                status: "hit",
                hit: { facetId: [g] },
            });
            if (publicPick.status === "hit") {
                expect(publicPick.hit.facetId).not.toBe(
                    child.facetCoords.keys().find((id) => id[0] === g)
                );
            }
            canvas.dispatchEvent(
                new MouseEvent("mousemove", {
                    clientX: point.x,
                    clientY: point.y,
                })
            );
            await vi.waitFor(() =>
                expect(tooltipContainer.textContent).toBe(`${g}: ${datum.x}`)
            );
            expect(hover.mock.lastCall[0]).toMatchObject({
                datum,
                facetId: [g],
            });
        }
        // The same datum in a second cell is still a new hover occurrence.
        expect(hover).toHaveBeenCalledTimes(3);
        expect(await controller.pick(new Point(105, 30))).toEqual({
            status: "empty",
        });
    }
);

/** @param {Partial<import("../spec/view.js").FacetSpec>} [overrides] */
async function createFacet(overrides = {}) {
    const root = await createAndInitialize(
        {
            vconcat: [
                {
                    data: {
                        values: [
                            { g: "A", row: 1, x: 2 },
                            { g: "B", row: 1, x: 8 },
                            { g: "C", row: 2, x: 5 },
                        ],
                    },
                    facet: { field: "g" },
                    columns: 2,
                    spec: {
                        width: 100,
                        height: 60,
                        mark: "point",
                        encoding: {
                            x: {
                                field: "x",
                                type: "quantitative",
                                axis: null,
                                scale: { domain: [0, 10] },
                            },
                        },
                    },
                    ...overrides,
                },
            ],
        },
        ConcatView
    );
    roots.push(root);
    renderToLayout(root);
    const facet = /** @type {import("./facetView.js").default} */ (
        root.children[0]
    );
    return {
        root,
        facet,
        child: facet.child,
        dispatcher: new InteractionDispatcher({ viewRoot: root }),
    };
}

/** @param {Rectangle} coords @param {number} [x] @param {number} [y] */
function pointIn(coords, x = 0.5, y = 0.5) {
    return new Point(coords.x + coords.width * x, coords.y + coords.height * y);
}

test("wrapped cells route capture/bubble once through the shared layered child", async () => {
    const { root, facet, child, dispatcher } = await createFacet({
        spec: {
            width: 100,
            height: 60,
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
        for (const capture of [true, false]) {
            view.addInteractionListener(
                "click",
                (event) => {
                    calls.push([view.name, capture, event.facetId]);
                },
                capture
            );
        }
    }
    const event = dispatcher.dispatch(
        pointIn(child.facetCoords.get(["C"])),
        new MouseEvent("click")
    );
    expect(event.target).toBe(layer.children[0]);
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
        (event) => event.stopPropagation(),
        true
    );
    dispatcher.dispatch(
        pointIn(child.facetCoords.get(["B"])),
        new MouseEvent("click")
    );
    expect(calls).toEqual([
        [root.name, true, undefined],
        [facet.name, true, undefined],
        [child.name, true, ["B"]],
        ["top", true, ["B"]],
    ]);
});

test("cell transitions retain old/new tuple identities without leaving the facet container", async () => {
    const { facet, child, dispatcher } = await createFacet({
        facet: {
            row: { field: "row" },
            column: { field: "g" },
        },
        columns: undefined,
    });
    /** @type {unknown[]} */
    const transitions = [];
    for (const view of [facet, child]) {
        for (const type of ["mouseenter", "mouseleave"]) {
            view.addInteractionListener(type, (event) =>
                transitions.push([view.name, type, event.facetId])
            );
        }
    }
    for (const id of [
        [1, "B"],
        [2, "C"],
    ]) {
        dispatcher.dispatch(
            pointIn(child.facetCoords.get(id)),
            new MouseEvent("mousemove")
        );
    }
    dispatcher.handlePointerLeave(new MouseEvent("mouseleave"));
    expect(transitions).toEqual([
        [facet.name, "mouseenter", undefined],
        [child.name, "mouseenter", [1, "B"]],
        [child.name, "mouseleave", [1, "B"]],
        [child.name, "mouseenter", [2, "C"]],
        [child.name, "mouseleave", [2, "C"]],
        [facet.name, "mouseleave", undefined],
    ]);
});

test.each(["click", "mouseover"])(
    "shared %s point selection follows the pointed cell",
    async (on) => {
        const { child, dispatcher } = await createFacet({
            spec: {
                width: 100,
                height: 60,
                mark: "point",
                params: [
                    {
                        name: "chosen",
                        select: { type: "point", on, toggle: false },
                    },
                ],
            },
        });
        const unit = /** @type {import("./unitView.js").default} */ (child);
        const rows = Array.from(unit.getCollector().getData());
        const getHover = vi.spyOn(child.context, "getCurrentHover");
        for (const g of ["A", "B"]) {
            const datum = rows.find((row) => row.g === g);
            getHover.mockReturnValue({
                mark: unit.mark,
                datum,
            });
            dispatcher.dispatch(
                pointIn(child.facetCoords.get([g])),
                new MouseEvent(on === "mouseover" ? "mousemove" : on)
            );
            expect(child.paramRuntime.findValue("chosen").datum).toBe(datum);
        }
        dispatcher.handlePointerLeave(new MouseEvent("mouseleave"));
        expect(child.paramRuntime.findValue("chosen").datum?.g).toBe(
            on === "mouseover" ? undefined : "B"
        );
    }
);

test("headers, gaps, and clipped cell areas do not acquire a child target", async () => {
    const { facet, child } = await createFacet();
    const coords = Rectangle.create(0, 0, 210, 166);
    facet.arrange(new DebuggingViewRenderingContext({}), coords, {
        firstFacet: true,
        clipRect: Rectangle.create(0, 0, 150, 55),
    });
    const dispatcher = new InteractionDispatcher({ viewRoot: facet });
    expect(
        dispatcher.dispatch(new Point(140, 30), new MouseEvent("click")).target
    ).toBe(child);
    for (const point of [
        new Point(140, 65),
        new Point(170, 30),
        new Point(105, 30),
        new Point(50, 5),
    ]) {
        expect(
            dispatcher.dispatch(point, new MouseEvent("click")).target
        ).toBeUndefined();
    }
});

test("a brush in a later cell uses its own projection and stays anchored during a document drag", async () => {
    const { root, child, dispatcher } = await createFacet({
        params: [
            { name: "brush", select: { type: "interval", encodings: ["x"] } },
        ],
    });
    const coords = child.facetCoords.get(["B"]);
    const start = pointIn(coords, 0.2);
    const end = pointIn(coords, 0.6);
    const event = dispatcher.dispatch(
        start,
        new MouseEvent("mousedown", { clientX: start.x, clientY: start.y })
    );
    expect(event.stopped).toBe(true);
    document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: end.x, clientY: end.y })
    );
    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(child.paramRuntime.findValue("brush").intervals.x).toEqual([2, 6]);
    renderToLayout(root);
    expect(child.facetCoords.size).toBe(3);
});

test("shared scales use the pointed cell's wheel and touch coordinates once per resolution", async () => {
    const { root, facet, child, dispatcher } = await createFacet({
        spec: {
            width: 100,
            height: 60,
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    axis: null,
                    scale: { domain: [0, 10], zoom: true },
                },
            },
            layer: [{ mark: "point" }, { mark: "point" }],
        },
    });
    const resolution = child.getScaleResolution("x");
    const zoom = vi.spyOn(resolution, "zoom");
    const coords = child.facetCoords.get(["B"]);
    const point = pointIn(coords, 0.25);
    const probe = dispatcher.dispatch(point, { type: "wheelclaimprobe" });
    expect(probe.wheelClaimed).toBe(true);
    expect(zoom).not.toHaveBeenCalled();
    const wheel = new WheelEvent("wheel", { deltaY: -300, cancelable: true });
    dispatcher.dispatch(point, wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(zoom).toHaveBeenCalledExactlyOnceWith(0.5, 0.25, 0);
    expect(resolution.getDomain()).toEqual([1.25, 6.25]);
    expect(facet.child.getScaleResolution("x")).toBe(resolution);

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
    expect(
        dispatcher.dispatch(new Point(105, 30), { type: "wheelclaimprobe" })
            .wheelClaimed
    ).toBe(false);
    root.disposeSubtree();
});

test("a cell pan uses its plot width and the routing grid cancels it on disposal", async () => {
    const { root, child, dispatcher } = await createFacet({
        spec: {
            width: 100,
            height: 60,
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    axis: null,
                    scale: { domain: [0, 10], zoom: true },
                },
            },
        },
    });
    const resolution = child.getScaleResolution("x");
    const point = pointIn(child.facetCoords.get(["C"]));
    const zoom = vi.spyOn(resolution, "zoom");
    const resume = vi.spyOn(root.context, "resumeHoverTracking");
    dispatcher.dispatch(
        point,
        new MouseEvent("mousedown", { clientX: point.x, clientY: point.y })
    );
    document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: point.x - 10, clientY: point.y })
    );
    expect(zoom).toHaveBeenCalledExactlyOnceWith(1, 0.5, expect.closeTo(-0.1));
    root.disposeSubtree();
    document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: point.x - 20, clientY: point.y })
    );
    expect(zoom).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
});

test("a stale hover in another cell does not snap the wheel anchor", async () => {
    const { child, dispatcher } = await createFacet({
        spec: {
            width: 100,
            height: 60,
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    axis: null,
                    scale: { domain: [0, 10], zoom: true },
                },
            },
        },
    });
    const unit = /** @type {import("./unitView.js").default} */ (child);
    const datum = Array.from(unit.getCollector().getData()).find(
        (datum) => datum.g === "A"
    );
    vi.spyOn(child.context, "getCurrentHover").mockReturnValue({
        mark: unit.mark,
        datum,
        facetId: ["A"],
    });
    const zoom = vi.spyOn(child.getScaleResolution("x"), "zoom");
    dispatcher.dispatch(
        pointIn(child.facetCoords.get(["B"]), 0.75),
        new WheelEvent("wheel", { deltaY: -300 })
    );
    expect(zoom).toHaveBeenCalledExactlyOnceWith(0.5, 0.75, expect.closeTo(0));
});

test("partly clipped cells retain full plot coordinates for shared-scale zoom", async () => {
    const { root, facet, child, dispatcher } = await createFacet({
        viewportHeight: 55,
        columns: 1,
        spec: {
            width: 100,
            height: 60,
            mark: "point",
            encoding: {
                y: {
                    field: "x",
                    type: "quantitative",
                    axis: null,
                    scale: { domain: [0, 10], zoom: true },
                },
            },
        },
    });
    renderToLayout(root);
    const cell = facet.getInteractionCell(pointIn(child.coords, 0.5, 0.2));
    expect(cell.childCoords.height).toBe(60);
    expect(child.coords.height).toBeLessThan(60);
    const point = pointIn(cell.childCoords, 0.5, 0.25);
    const zoom = vi.spyOn(child.getScaleResolution("y"), "zoom");
    dispatcher.dispatch(point, new WheelEvent("wheel", { deltaY: -300 }));
    expect(zoom).toHaveBeenCalledExactlyOnceWith(0.5, 0.75, expect.closeTo(0));
});

test("dragging an unzoomable cell direction scrolls the enclosing facet viewport", async () => {
    const { root, child, dispatcher } = await createFacet({
        viewportHeight: 55,
        columns: 1,
        spec: {
            width: 100,
            height: 60,
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    axis: null,
                    scale: { domain: [0, 10], zoom: true },
                },
            },
        },
    });
    const scrollbar = /** @type {import("./gridView/scrollbar.js").default} */ (
        root.getDescendants().find((view) => view.name === "scrollbar-vertical")
    );
    const point = pointIn(child.coords);
    dispatcher.dispatch(
        point,
        new MouseEvent("mousedown", { clientX: point.x, clientY: point.y })
    );
    document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: point.x, clientY: point.y - 20 })
    );
    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(scrollbar.viewportOffset).toBe(20);
    expect(child.getScaleResolution("x").getDomain()).toEqual([0, 10]);
    renderToLayout(root);
    expect(child.coords.y).toBeLessThan(point.y);
});

test("scrolling refreshes culled cells and routes to the newly visible cell", async () => {
    const { root, child, dispatcher } = await createFacet({
        viewportHeight: 55,
        columns: 1,
    });
    expect(child.facetCoords.has(["B"])).toBe(false);
    root.context.requestLayoutReflow = () => {
        renderToLayout(root);
    };
    const scrollbar = /** @type {import("./gridView/scrollbar.js").default} */ (
        root.getDescendants().find((view) => view.name === "scrollbar-vertical")
    );
    scrollbar.setViewportOffset(100);
    const coords = child.facetCoords.get(["B"]);
    expect(coords.height).toBeGreaterThan(0);
    const event = dispatcher.dispatch(pointIn(coords), new MouseEvent("click"));
    expect(event.target).toBe(child);
    expect(event.facetId).toEqual(["B"]);
});

test("an enclosing concat viewport refreshes its facet descendants when scrolled", async () => {
    const { facet } = await createFacet({ columns: 1 });
    const root = await createAndInitialize(
        {
            vconcat: [
                {
                    viewportHeight: 55,
                    vconcat: [facet.spec],
                },
            ],
        },
        ConcatView
    );
    roots.push(root);
    renderToLayout(root);
    const container = /** @type {ConcatView} */ (root.children[0]);
    const nestedFacet = /** @type {import("./facetView.js").default} */ (
        container.children[0]
    );
    root.context.requestLayoutReflow = () => {
        renderToLayout(root);
    };
    const scrollbar = /** @type {import("./gridView/scrollbar.js").default} */ (
        root.getDescendants().find((view) => view.name === "scrollbar-vertical")
    );
    expect(nestedFacet.child.facetCoords.has(["B"])).toBe(false);
    scrollbar.setViewportOffset(100);
    const dispatcher = new InteractionDispatcher({ viewRoot: root });
    const event = dispatcher.dispatch(
        pointIn(nestedFacet.child.facetCoords.get(["B"])),
        new MouseEvent("click")
    );
    expect(event.target).toBe(nestedFacet.child);
    expect(event.facetId).toEqual(["B"]);
});
