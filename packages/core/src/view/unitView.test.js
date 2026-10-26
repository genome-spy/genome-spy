import { afterEach, beforeEach, describe, expect, test } from "vitest";

import InteractionDispatcher from "../genomeSpy/interactionDispatcher.js";
import { createEmbedParamNamespace } from "../paramRuntime/embedParamApi.js";
import ConcatView from "./concatView.js";
import { createViewMutationApi } from "./viewMutationApi.js";
import Point from "./layout/point.js";
import Rectangle from "./layout/rectangle.js";
import { createAndInitialize, renderToLayout } from "./testUtils.js";

const OriginalMouseEvent = globalThis.MouseEvent;

class FakeMouseEvent {
    /**
     * @param {string} type
     */
    constructor(type) {
        this.type = type;
        this.shiftKey = false;
    }
}

describe("UnitView point selections", () => {
    beforeEach(() => {
        globalThis.MouseEvent = /** @type {typeof MouseEvent} */ (
            /** @type {unknown} */ (FakeMouseEvent)
        );
    });

    afterEach(() => {
        if (OriginalMouseEvent) {
            globalThis.MouseEvent = OriginalMouseEvent;
        } else {
            delete globalThis.MouseEvent;
        }
    });

    test.each([
        { on: "click", outer: false },
        { on: "pointerover", outer: true },
    ])(
        "single selection on $on (outer: $outer) observes API replacement and clearing",
        async ({ on, outer }) => {
            const view = await createAndInitialize(
                {
                    params: outer ? [{ name: "selected", value: null }] : [],
                    vconcat: [
                        {
                            ...makeUnitSpec("records"),
                            params: [
                                {
                                    name: "selected",
                                    select: {
                                        type: "point",
                                        toggle: false,
                                        on,
                                    },
                                    push: outer ? "outer" : undefined,
                                },
                            ],
                            data: {
                                values: [
                                    { name: "A", x: 1, y: 1 },
                                    { name: "B", x: 2, y: 2 },
                                ],
                            },
                            encoding: {
                                key: { field: "name" },
                                x: { field: "x", type: "quantitative" },
                                y: { field: "y", type: "quantitative" },
                            },
                        },
                    ],
                },
                ConcatView
            );
            renderToLayout(view, Rectangle.create(0, 0, 300, 240));
            const unit = /** @type {import("./unitView.js").default} */ (
                view.children[0]
            );
            const [datum] = unit.getCollector().getData();
            view.context.getCurrentHover = () => ({ mark: unit.mark, datum });
            const dispatcher = new InteractionDispatcher({ viewRoot: view });
            const interact = () =>
                dispatcher.dispatch(
                    center(unit),
                    /** @type {MouseEvent} */ (
                        new FakeMouseEvent(
                            on === "pointerover" ? "mousemove" : on
                        )
                    )
                );
            const selected = createViewMutationApi({ viewRoot: view })
                .get({ scope: [], view: "records" })
                .params.getSelection("selected");
            if (selected.type !== "point")
                throw new Error("Expected point selection.");

            interact();
            expect(selected.getValue().data[0].name).toBe("A");
            selected.setValue([["B"]]);
            interact();
            expect(selected.getValue().data[0].name).toBe("A");
            selected.clear();
            interact();
            expect(selected.getValue().data[0].name).toBe("A");
        }
    );

    test("Shift-click updates a shared outer point selection across views", async () => {
        const view = await createAndInitialize(
            {
                params: [{ name: "picked", value: null }],
                hconcat: ["first", "second"].map((name) => ({
                    ...makeUnitSpec(name),
                    params: [
                        { name: "picked", select: "point", push: "outer" },
                    ],
                })),
            },
            ConcatView
        );
        renderToLayout(view, Rectangle.create(0, 0, 600, 240));
        const [first, second] =
            /** @type {import("./unitView.js").default[]} */ (view.children);
        const dispatcher = new InteractionDispatcher({ viewRoot: view });
        const selection =
            createEmbedParamNamespace(first).getSelection("picked");

        const click = (
            /** @type {import("./unitView.js").default} */ unit,
            shift = false
        ) => {
            const datum = Array.from(unit.getCollector().getData())[0];
            view.context.getCurrentHover = () => ({ mark: unit.mark, datum });
            const event = new FakeMouseEvent("click");
            event.shiftKey = shift;
            dispatcher.dispatch(
                center(unit),
                /** @type {MouseEvent} */ (event)
            );
        };
        const selectedNames = () => {
            const snapshot = selection.getValue();
            if (snapshot.type !== "point")
                throw new Error("Expected point selection.");
            return snapshot.data.map((row) => row.name);
        };

        click(first);
        expect(selectedNames()).toEqual(["first"]);
        click(second, true);
        expect(selectedNames()).toEqual(["first", "second"]);
        click(first, true);
        expect(selectedNames()).toEqual(["second"]);
        selection.clear();
        click(second, true);
        expect(selectedNames()).toEqual(["second"]);
    });

    test.each([false, true])(
        "shared hover follows marks and clears on exit (layered: %s)",
        async (layered) => {
            /** @type {import("../spec/view.js").UnitSpec[]} */
            const marks = ["first", "second"].map((name) => ({
                name,
                height: 100,
                params: [
                    {
                        name: "highlight",
                        select: { type: "point", on: "pointerover" },
                        push: "outer",
                    },
                ],
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                },
            }));
            const view = await createAndInitialize(
                {
                    params: [{ name: "highlight", value: null }],
                    data: { values: [{ name: "gene", x: 1, y: 1 }] },
                    // Both marks deliberately receive the same tuple object.
                    transform: [{ type: "identifier" }],
                    vconcat: [layered ? { layer: marks } : { vconcat: marks }],
                },
                ConcatView
            );
            renderToLayout(view, Rectangle.create(0, 0, 300, 240));
            const [first, second] =
                /** @type {import("./unitView.js").default[]} */ (
                    Array.from(view.getDescendants()).filter((v) =>
                        ["first", "second"].includes(v.name)
                    )
                );
            const [datum] = first.getCollector().getData();
            expect(Array.from(second.getCollector().getData())[0]).toBe(datum);

            const dispatcher = new InteractionDispatcher({ viewRoot: view });
            const hover = (
                /** @type {import("./unitView.js").default} */ unit,
                picked = true
            ) => {
                view.context.getCurrentHover = () =>
                    picked ? { mark: unit.mark, datum } : undefined;
                dispatcher.dispatch(
                    center(unit),
                    /** @type {MouseEvent} */ (new FakeMouseEvent("mousemove"))
                );
            };
            const selected = () =>
                first.paramRuntime.findValue("highlight").datum;

            hover(first);
            expect(selected()).toBe(datum);
            hover(second);
            expect(selected()).toBe(datum);
            hover(first);
            expect(selected()).toBe(datum);
            hover(second, false);
            expect(selected()).toBeNull();
            hover(first);
            dispatcher.handlePointerLeave(
                /** @type {MouseEvent} */ (new FakeMouseEvent("mouseout"))
            );
            expect(selected()).toBeNull();
        }
    );

    test("clears a hover selection when the pointer enters a sibling view", async () => {
        const view = await createAndInitialize(
            {
                vconcat: [
                    makeHoverUnitSpec("first"),
                    makeHoverUnitSpec("second"),
                ],
            },
            ConcatView
        );
        renderToLayout(view, Rectangle.create(0, 0, 300, 240));

        const [first, second] =
            /** @type {import("./unitView.js").default[]} */ (view.children);
        const firstDatum = Array.from(first.getCollector().getData())[0];
        const secondDatum = Array.from(second.getCollector().getData())[0];
        /** @type {ReturnType<typeof view.context.getCurrentHover>} */
        let currentHover;
        view.context.getCurrentHover = () => currentHover;

        const dispatcher = new InteractionDispatcher({ viewRoot: view });

        currentHover = {
            mark: first.mark,
            datum: firstDatum,
        };
        dispatcher.dispatch(
            center(first),
            /** @type {MouseEvent} */ (new FakeMouseEvent("mousemove"))
        );

        expect(first.paramRuntime.getValue("firstSelection").datum).toBe(
            firstDatum
        );

        currentHover = {
            mark: second.mark,
            datum: secondDatum,
        };
        dispatcher.dispatch(
            center(second),
            /** @type {MouseEvent} */ (new FakeMouseEvent("mousemove"))
        );

        expect(first.paramRuntime.getValue("firstSelection").datum).toBeNull();
        expect(second.paramRuntime.getValue("secondSelection").datum).toBe(
            secondDatum
        );
    });

    test("clears a hover selection in a layer when the pointer enters a sibling view", async () => {
        const view = await createAndInitialize(
            {
                vconcat: [
                    {
                        layer: [
                            makeUnitSpec("underlay"),
                            makeHoverUnitSpec("layered", {
                                type: "mouseleave",
                                filter: "event.shiftKey",
                            }),
                        ],
                    },
                    makeUnitSpec("sibling"),
                ],
            },
            ConcatView
        );
        renderToLayout(view, Rectangle.create(0, 0, 300, 240));

        const layer = /** @type {import("./layerView.js").default} */ (
            view.children[0]
        );
        const layered = /** @type {import("./unitView.js").default} */ (
            Array.from(layer)[1]
        );
        const sibling = /** @type {import("./unitView.js").default} */ (
            view.children[1]
        );
        const layeredDatum = Array.from(layered.getCollector().getData())[0];
        /** @type {ReturnType<typeof view.context.getCurrentHover>} */
        let currentHover = {
            mark: layered.mark,
            datum: layeredDatum,
        };
        view.context.getCurrentHover = () => currentHover;

        const dispatcher = new InteractionDispatcher({ viewRoot: view });
        dispatcher.dispatch(
            center(layered),
            /** @type {MouseEvent} */ (new FakeMouseEvent("mousemove"))
        );

        expect(layered.paramRuntime.getValue("layeredSelection").datum).toBe(
            layeredDatum
        );

        currentHover = undefined;
        dispatcher.dispatch(
            center(sibling),
            /** @type {MouseEvent} */ (new FakeMouseEvent("mousemove"))
        );

        expect(
            layered.paramRuntime.getValue("layeredSelection").datum
        ).toBeNull();
    });
});

/**
 * @param {string} name
 * @param {import("../spec/parameter.js").PointSelectionConfig["clear"]} [clear]
 * @returns {import("../spec/view.js").UnitSpec}
 */
function makeHoverUnitSpec(name, clear) {
    return {
        ...makeUnitSpec(name),
        params: [
            {
                name: name + "Selection",
                select: {
                    type: "point",
                    on: "pointerover",
                    ...(clear === undefined ? {} : { clear }),
                },
            },
        ],
    };
}

/**
 * @param {string} name
 * @returns {import("../spec/view.js").UnitSpec}
 */
function makeUnitSpec(name) {
    return {
        name,
        height: 100,
        data: { values: [{ name, x: 1, y: 1 }] },
        mark: "point",
        encoding: {
            x: { field: "x", type: "quantitative" },
            y: { field: "y", type: "quantitative" },
        },
    };
}

/**
 * @param {import("./unitView.js").default} view
 */
function center(view) {
    return new Point(
        view.coords.x + view.coords.width / 2,
        view.coords.y + view.coords.height / 2
    );
}
