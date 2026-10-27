import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestEmbed } from "../view/embedTestUtils.js";
import Interaction from "../utils/interaction.js";
import Point from "../view/layout/point.js";

beforeEach(() => {
    // Headless interactions still exercise the normal point event/filter path.
    vi.stubGlobal(
        "MouseEvent",
        class {
            /** @param {string} type @param {object} [options] */
            constructor(type, options = {}) {
                Object.assign(this, { type, shiftKey: false }, options);
            }
        }
    );
});
afterEach(() => vi.unstubAllGlobals());

/** @param {import("../spec/parameter.js").Parameter[]} [params] @returns {import("../spec/view.js").UnitSpec} */
function spec(
    params = [
        { name: "focus", select: { type: "point", encodings: ["color"] } },
    ]
) {
    return {
        name: "cells",
        params,
        data: {
            values: [
                { state: "A", x: 1 },
                { state: "B", x: 2 },
                { state: "A", x: 3 },
            ],
        },
        mark: "point",
        encoding: {
            x: { field: "x", type: "quantitative" },
            color: {
                field: "state",
                type: "ordinal",
                scale: { domain: ["A", "B"] },
            },
        },
    };
}

/** @param {import("../types/embedApi.js").ViewHandle} handle */
function categories(handle) {
    const selection = handle.params.getSelection("focus");
    if (selection.type !== "point" || selection.membership !== "categories")
        throw new Error("Expected categories.");
    return selection;
}

test("category API normalizes detached typed values and rejects writes atomically", async () => {
    const { views, root } = await createTestEmbed(spec());
    const api = categories(views.root());
    const listener = vi.fn();
    api.subscribe(listener, { delivery: "commit" });
    const values = [[1], ["1"], [false], [1]];
    api.setValue(values);
    values[0][0] = 99;
    await root.paramRuntime.whenPropagated();
    expect(api.getValue()).toEqual({
        type: "point",
        membership: "categories",
        active: true,
        encodings: ["color"],
        values: [[1], ["1"], [false]],
    });
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = api.getValue();
    /** @type {any} */ (snapshot.values)[0][0] = "changed";
    for (const invalid of [
        [[NaN]],
        [[Infinity]],
        [[null]],
        [[{}]],
        [["A", "B"]],
    ]) {
        expect(() => api.setValue(/** @type {any} */ (invalid))).toThrow();
    }
    expect(api.getValue().values).toEqual([[1], ["1"], [false]]);
    expect(() =>
        views
            .root()
            .params.get("focus")
            .setValue(/** @type {any} */ ([]))
    ).toThrow(/getSelection/);
    api.clear();
    expect(api.getValue().active).toBe(false);
});

test.each([true, false])(
    "plot gestures share API membership (toggle: %s)",
    async (toggle) => {
        const { root, context, views } = await createTestEmbed(
            spec([
                {
                    name: "focus",
                    select: { type: "point", encodings: ["color"], toggle },
                },
            ])
        );
        const unit = /** @type {import("../view/unitView.js").default} */ (
            root
        );
        const rows = Array.from(unit.getCollector().getData());
        const api = categories(views.root());
        /** @param {number} index @param {boolean} [shiftKey] @param {string} [type] */
        const click = (index, shiftKey = false, type = "click") => {
            context.getCurrentHover = () => ({
                mark: unit.mark,
                datum: rows[index],
            });
            unit.handleInteraction(
                new Interaction(
                    new Point(0, 0),
                    new MouseEvent(type, { shiftKey })
                ),
                false
            );
        };
        api.setValue([["B"]]);
        const previous = root.paramRuntime.getValue("focus");
        click(0, true);
        // Gesture updates must leave previously published membership intact.
        expect(Array.from(previous.values)).toEqual(["B"]);
        expect(api.getValue().values).toEqual(
            toggle ? [["B"], ["A"]] : [["A"]]
        );
        click(2, true);
        expect(api.getValue().values).toEqual(toggle ? [["B"]] : [["A"]]);
        click(1);
        expect(api.getValue().values).toEqual([["B"]]);
        click(1, false, "dblclick");
        expect(api.getValue().values).toEqual([]);
        if (!toggle)
            expect(() => api.setValue([["A"], ["B"]])).toThrow(/at most one/);
    }
);

test("outer category writers preserve initialization and read-only consumers", async () => {
    const { root, views } = await createTestEmbed({
        params: [
            {
                name: "focus",
                select: { type: "point", encodings: ["color"] },
                value: [{ color: "B" }],
            },
        ],
        hconcat: [
            spec([
                {
                    name: "focus",
                    select: { type: "point", encodings: ["color"] },
                    push: "outer",
                },
            ]),
            { ...spec([]), name: "reader" },
        ],
    });
    const api = categories(views.root());
    expect(api.getValue().values).toEqual([["B"]]);
    const writer = categories(views.get({ scope: [], view: "cells" }));
    writer.setValue([["absent"]]);
    expect(api.getValue().values).toEqual([["absent"]]);
    const reader = root.getDescendants().find((view) => view.name === "reader");
    expect(reader.paramRuntime.hasPointSelections()).toBe(false);
    expect(
        reader.paramRuntime.hasPointSelections({
            inherited: true,
            recordsOnly: true,
        })
    ).toBe(false);
});

test("expression helpers are reactive, scoped, detached semantic values", async () => {
    const { root, views } = await createTestEmbed(
        spec([
            {
                name: "focus",
                select: { type: "point", encodings: ["color"] },
                value: [{ color: "A" }, { color: "A" }],
            },
            { name: "activity", expr: "selectionActive(focus)" },
            { name: "values", expr: "selectionValues(focus, 'color')" },
            { name: "brush", select: { type: "interval", encodings: ["x"] } },
        ])
    );
    const api = categories(views.root());
    expect(root.paramRuntime.findValue("values")).toEqual(["A"]);
    root.paramRuntime.findValue("values").push("mutated");
    expect(api.getValue().values).toEqual([["A"]]);
    api.clear();
    await root.paramRuntime.whenPropagated();
    expect(root.paramRuntime.findValue("activity")).toBe(false);
    expect(
        root.paramRuntime.createExpression("selectionBounds(brush, 'x')")()
    ).toBe(null);
    expect(() =>
        root.paramRuntime.createExpression("selectionValues(focus, 'shape')")()
    ).toThrow(/Undeclared/);
    expect(() =>
        root.paramRuntime.createExpression("selectionBounds(focus, 'color')")()
    ).toThrow(/interval/);
});

test.each([
    { datum: "A", type: "ordinal" },
    { expr: "datum.state", type: "ordinal" },
    { field: "state", type: "quantitative" },
    { field: "state", type: "ordinal", scale: { type: "quantize" } },
])(
    "rejects unsupported category source %j at initialization",
    async (color) => {
        const input = spec();
        input.encoding.color = /** @type {any} */ (color);
        await expect(createTestEmbed(input)).rejects.toThrow();
    }
);

test.each([
    { type: "point" },
    { type: "point", encodings: ["shape"] },
    { type: "point", encodings: ["color"], toggle: false },
])("rejects incompatible shared writer %j", async (select) => {
    await expect(
        createTestEmbed({
            params: [
                {
                    name: "focus",
                    select: { type: "point", encodings: ["color"] },
                },
            ],
            hconcat: [
                spec([
                    {
                        name: "focus",
                        push: "outer",
                        select: /** @type {any} */ (select),
                    },
                ]),
            ],
        })
    ).rejects.toThrow(/Conflicting selection declarations/);
});
