import { afterEach, beforeEach, describe, expect, test } from "vitest";

import InteractionDispatcher from "../genomeSpy/interactionDispatcher.js";
import ConcatView from "./concatView.js";
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
