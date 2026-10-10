// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { createAndInitialize, renderToLayout } from "./testUtils.js";
import ConcatView from "./concatView.js";
import Point from "./layout/point.js";
import Rectangle from "./layout/rectangle.js";
import InteractionDispatcher from "../genomeSpy/interactionDispatcher.js";
import DebuggingViewRenderingContext from "./renderingContext/debuggingViewRenderingContext.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";

/** @type {ConcatView[]} */
const roots = [];
afterEach(() => {
    roots.forEach((root) => root.disposeSubtree());
    roots.length = 0;
    vi.restoreAllMocks();
});

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
                uniqueId: datum[UNIQUE_ID_KEY],
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
