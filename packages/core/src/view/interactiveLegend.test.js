import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestEmbed } from "./embedTestUtils.js";
import UnitView from "./unitView.js";
import LegendView from "./legendView.js";
import Interaction from "../utils/interaction.js";
import Point from "./layout/point.js";
import { renderToLayout } from "./testUtils.js";

beforeEach(() =>
    vi.stubGlobal(
        "MouseEvent",
        class {
            /** @param {string} type @param {object} [options] */
            constructor(type, options = {}) {
                Object.assign(this, { type, shiftKey: false }, options);
            }
        }
    )
);
afterEach(() => vi.unstubAllGlobals());

/** @param {string} type @param {UnitView} unit @param {import("../data/flowNode.js").Datum} row @param {MouseEventInit} [options] */
function pickedEvent(type, unit, row, options) {
    const event = new Interaction(
        new Point(0, 0),
        new MouseEvent(type, options)
    );
    event.markHit = { mark: unit.mark, datum: row, uniqueId: row.__uniqueId };
    return event;
}

/** @returns {import("../spec/view.js").VConcatSpec & import("../spec/root.js").RootConfig} */
function spec() {
    return {
        resolve: { scale: { shape: "shared", color: "shared" } },
        params: [
            {
                name: "types",
                select: { type: "point", encodings: ["shape"] },
                bind: "legend",
            },
            {
                name: "states",
                select: { type: "point", encodings: ["color"] },
                bind: "legend",
            },
            { name: "baseOpacity", value: 0.8 },
        ],
        config: {
            legend: { disable: false, symbolOpacity: { expr: "baseOpacity" } },
        },
        vconcat: [
            {
                name: "cells",
                data: {
                    values: [
                        { cell: "T", state: 1 },
                        { cell: "T", state: "1" },
                        { cell: "B", state: 1 },
                        { cell: "B", state: "1" },
                    ],
                },
                mark: { type: "point", tooltip: null },
                encoding: {
                    shape: {
                        field: "cell",
                        type: "nominal",
                        scale: { domain: ["T", "B"] },
                    },
                    color: {
                        field: "state",
                        type: "ordinal",
                        scale: { domain: [1, "1"], range: ["red", "red"] },
                    },
                    opacity: {
                        condition: {
                            test: {
                                and: [{ param: "types" }, { param: "states" }],
                            },
                            value: 1,
                        },
                        value: 0.1,
                    },
                },
            },
        ],
    };
}

test("legend input and feedback share typed native membership and preserve base style", async () => {
    const { root, views } = await createTestEmbed(spec());
    const legends = root
        .getDescendants()
        .filter((view) => view instanceof LegendView);
    expect(legends).toHaveLength(2);
    const cells = root.getDescendants().find((view) => view.name === "cells");
    expect(
        /** @type {UnitView} */ (cells).mark.encoders.uniqueId
    ).toBeUndefined();
    const types = views.root().params.getSelection("types");
    const states = views.root().params.getSelection("states");
    if (
        types.type !== "point" ||
        types.membership !== "categories" ||
        states.type !== "point" ||
        states.membership !== "categories"
    )
        throw new Error("Expected categories");
    types.setValue([["T"]]);
    states.setValue([["1"]]);
    await root.paramRuntime.whenPropagated();
    const unit = /** @type {UnitView} */ (cells);
    expect(
        Array.from(unit.getCollector().getData(), (row) =>
            unit.mark.encoders.fillOpacity(row)
        )
    ).toEqual([0.1, 1, 0.1, 0.1]);
    /** @param {LegendView} legend */
    const feedback = (legend) => {
        const units = legend
            .getDescendants()
            .filter((view) => view instanceof UnitView);
        const symbol = units.find((view) => view.name === "symbols");
        const label = units.find((view) => view.name === "labels");
        const rows = Array.from(symbol.getCollector().getData());
        return { units, symbol, label, rows };
    };
    const shape = legends.find(
        (legend) => feedback(legend).rows[0].value === "T"
    );
    const { symbol, label, rows } = feedback(shape);
    expect(rows.map((row) => symbol.mark.encoders.strokeOpacity(row))).toEqual([
        0.8,
        expect.closeTo(0.28),
    ]);
    expect(rows.map((row) => label.mark.encoders.opacity(row))).toEqual([
        1, 0.35,
    ]);
    const color = feedback(
        legends.find((legend) => feedback(legend).rows[0].value === 1)
    );
    expect(
        color.rows.map((row) => color.label.mark.encoders.opacity(row))
    ).toEqual([0.35, 1]);
    views.root().params.get("baseOpacity").setValue(0.4);
    await root.paramRuntime.whenPropagated();
    expect(rows.map((row) => symbol.mark.encoders.strokeOpacity(row))).toEqual([
        0.4,
        expect.closeTo(0.14),
    ]);

    // Route the picked entry through the actual legend listener, without browser geometry.
    const entry = feedback(shape).units.find((view) => view.name === "entries");
    const row = Array.from(entry.getCollector().getData())[1];
    shape.handleInteraction(
        pickedEvent("click", entry, row, { shiftKey: true }),
        false
    );
    expect(types.getValue().values).toEqual([["T"], ["B"]]);
    expect(states.getValue().values).toEqual([["1"]]);
    shape.handleInteraction(pickedEvent("dblclick", entry, row), false);
    expect(types.getValue().active).toBe(false);
    expect(states.getValue().active).toBe(true);
});

/** @param {string} name @param {import("../spec/parameter.js").Parameter[]} params @returns {import("../spec/view.js").UnitSpec} */
function panel(name, params) {
    return {
        name,
        params,
        mark: { type: "point", tooltip: null },
        data: { values: [{ group: "A" }, { group: "B" }] },
        encoding: {
            color: {
                field: "group",
                type: "nominal",
                scale: { domain: ["A", "B"] },
            },
        },
    };
}

test("shared legend captures the binding ref despite another contributor's shadowed name", async () => {
    const { root, views } = await createTestEmbed({
        config: { legend: { disable: false, symbolOpacity: 1 } },
        params: [
            {
                name: "focus",
                select: { type: "point", encodings: ["color"] },
                value: [{ color: "A" }],
            },
        ],
        resolve: { scale: { color: "shared" }, legend: { color: "shared" } },
        hconcat: [
            panel("shadow", [
                {
                    name: "focus",
                    select: { type: "point", encodings: ["color"] },
                    value: [{ color: "B" }],
                },
            ]),
            panel("writer", [
                {
                    name: "focus",
                    select: { type: "point", encodings: ["color"] },
                    push: "outer",
                    bind: "legend",
                },
            ]),
        ],
    });
    const legends = root
        .getDescendants()
        .filter((view) => view instanceof LegendView);
    expect(legends).toHaveLength(1);
    const symbols = /** @type {UnitView} */ (
        legends[0].getDescendants().find((view) => view.name === "symbols")
    );
    const rows = Array.from(symbols.getCollector().getData());
    expect(rows.map((row) => symbols.mark.encoders.strokeOpacity(row))).toEqual(
        [1, 0.35]
    );
    const focus = views.root().params.getSelection("focus");
    if (focus.type !== "point" || focus.membership !== "categories")
        throw new Error("Expected categories");
    focus.setValue([["B"]]);
    await root.paramRuntime.whenPropagated();
    expect(rows.map((row) => symbols.mark.encoders.strokeOpacity(row))).toEqual(
        [0.35, 1]
    );
});

test("collected independent legends retain local selection and scale ownership", async () => {
    const { root, views } = await createTestEmbed({
        config: { legend: { disable: false, symbolOpacity: 1 } },
        resolve: {
            scale: { color: "independent" },
            legend: { color: "collected" },
        },
        hconcat: ["left", "right"].map((name) =>
            panel(name, [
                {
                    name: "focus",
                    select: { type: "point", encodings: ["color"] },
                    bind: "legend",
                },
            ])
        ),
    });
    const focus = views
        .get({ scope: [], view: "right" })
        .params.getSelection("focus");
    if (focus.type !== "point" || focus.membership !== "categories")
        throw new Error("Expected categories");
    focus.setValue([["B"]]);
    await root.paramRuntime.whenPropagated();
    const legends = root
        .getDescendants()
        .filter((view) => view instanceof LegendView);
    expect(legends).toHaveLength(2);
    for (const legend of legends) {
        const symbols = /** @type {UnitView} */ (
            legend.getDescendants().find((view) => view.name === "symbols")
        );
        const opacity = Array.from(symbols.getCollector().getData(), (row) =>
            symbols.mark.encoders.strokeOpacity(row)
        );
        expect(opacity).toEqual(
            legend.dataParent.name === "right" ? [0.35, 1] : [1, 1]
        );
    }
    await views.remove({ scope: [], view: "right" });
    expect(
        root.getDescendants().filter((view) => view instanceof LegendView)
    ).toHaveLength(1);
});

test("legend bindings reject missing, ambiguous, continuous, and competing targets", async () => {
    const disabled = spec();
    disabled.config.legend.disable = true;
    const ambiguous = spec();
    delete ambiguous.resolve;
    const continuous = spec();
    const plot = /** @type {import("../spec/view.js").UnitSpec} */ (
        continuous.vconcat[0]
    );
    plot.encoding.color = { field: "state", type: "quantitative" };
    const competing = spec();
    competing.params.push({
        name: "other",
        select: { type: "point", encodings: ["shape"] },
        bind: "legend",
    });
    for (const invalid of [disabled, ambiguous, continuous, competing]) {
        await expect(createTestEmbed(invalid)).rejects.toThrow(
            /legend|competing/i
        );
    }
});

test("legend-only sources avoid plot picking, while explicit plot and record inputs retain it", async () => {
    for (const mode of ["legend", "plot", "records"]) {
        const input = panel("source", [
            {
                name: "focus",
                bind: "legend",
                select: {
                    type: "point",
                    encodings: ["color"],
                    ...(mode === "plot" ? { on: "click" } : {}),
                },
            },
        ]);
        if (mode === "records")
            input.params.push({ name: "picked", select: "point" });
        const { root } = await createTestEmbed({
            config: { legend: { disable: false } },
            vconcat: [input],
        });
        const unit = /** @type {UnitView} */ (
            root.getDescendants().find((view) => view.name === "source")
        );
        expect(unit.mark.isPickingParticipant()).toBe(mode !== "legend");
        expect(Boolean(unit.mark.encoders.uniqueId)).toBe(mode !== "legend");
    }
});

test("a merged color/shape legend supports one native shape binding", async () => {
    const input = panel("source", [
        {
            name: "focus",
            select: { type: "point", encodings: ["shape"] },
            bind: "legend",
            value: [{ shape: "B" }],
        },
    ]);
    input.encoding.shape = {
        field: "group",
        type: "nominal",
        scale: { domain: ["A", "B"] },
    };
    const { root } = await createTestEmbed({
        config: { legend: { disable: false, symbolOpacity: 1 } },
        vconcat: [input],
    });
    const legends = root
        .getDescendants()
        .filter((view) => view instanceof LegendView);
    expect(legends).toHaveLength(1);
    const symbols = /** @type {UnitView} */ (
        legends[0].getDescendants().find((view) => view.name === "symbols")
    );
    expect(
        Array.from(symbols.getCollector().getData(), (row) =>
            symbols.mark.encoders.fillOpacity(row)
        )
    ).toEqual([0.35, 1]);
});

test("explicit plot hover and legend clicks share toggle settings but keep event filters and clear targets", async () => {
    const input = panel("source", [
        {
            name: "focus",
            bind: "legend",
            select: {
                type: "point",
                encodings: ["color"],
                on: "pointerover[event.ctrlKey]",
                toggle: true,
                clear: "dblclick[event.altKey]",
            },
        },
    ]);
    const { root, views, context } = await createTestEmbed({
        config: { legend: { disable: false } },
        vconcat: [input],
    });
    const source = /** @type {UnitView} */ (
        root.getDescendants().find((view) => view.name === "source")
    );
    const legend = root
        .getDescendants()
        .find((view) => view instanceof LegendView);
    const entry = /** @type {UnitView} */ (
        legend.getDescendants().find((view) => view.name === "entries")
    );
    const a = Array.from(source.getCollector().getData())[0];
    const b = Array.from(entry.getCollector().getData())[1];
    const focus = views
        .get({ scope: [], view: "source" })
        .params.getSelection("focus");
    if (focus.type !== "point" || focus.membership !== "categories")
        throw new Error("Expected categories");
    /** @param {import("./view.js").default} view @param {string} type @param {import("../types/interactionApi.js").InternalMarkHit | null} hit @param {MouseEventInit} [options] */
    const send = (view, type, hit, options) => {
        const event = new Interaction(
            new Point(0, 0),
            new MouseEvent(type, options)
        );
        event.markHit = hit;
        view.handleInteraction(event, false);
    };
    const plotHit = { mark: source.mark, datum: a, uniqueId: a.__uniqueId };
    const entryHit = { mark: entry.mark, datum: b, uniqueId: b.__uniqueId };
    context.getCurrentHover = () => entryHit;
    send(source, "mousemove", plotHit);
    expect(focus.getValue().active).toBe(false);
    send(source, "mousemove", plotHit, { ctrlKey: true });
    expect(focus.getValue().values).toEqual([["A"]]);
    send(legend, "click", entryHit, { shiftKey: true });
    expect(focus.getValue().values).toEqual([["A"], ["B"]]);
    // A picked-empty title/padding event must not reuse the previous entry hit.
    send(legend, "dblclick", null, { altKey: true });
    send(legend, "dblclick", entryHit);
    expect(focus.getValue().active).toBe(true);
    send(legend, "dblclick", entryHit, { altKey: true });
    expect(focus.getValue().active).toBe(false);
});

test("legend single-value mode and disabled clearing preserve API control", async () => {
    const input = panel("source", [
        {
            name: "focus",
            bind: "legend",
            select: {
                type: "point",
                encodings: ["color"],
                toggle: false,
                clear: false,
            },
            value: [{ color: "B" }],
        },
    ]);
    const { root, views } = await createTestEmbed({
        config: { legend: { disable: false } },
        vconcat: [input],
    });
    const legend = root
        .getDescendants()
        .find((view) => view instanceof LegendView);
    const entry = /** @type {UnitView} */ (
        legend.getDescendants().find((view) => view.name === "entries")
    );
    const row = Array.from(entry.getCollector().getData())[0];
    const focus = views
        .get({ scope: [], view: "source" })
        .params.getSelection("focus");
    if (focus.type !== "point" || focus.membership !== "categories")
        throw new Error("Expected categories");
    legend.handleInteraction(
        pickedEvent("click", entry, row, { shiftKey: true }),
        false
    );
    expect(focus.getValue().values).toEqual([["A"]]);
    legend.handleInteraction(pickedEvent("dblclick", entry, row), false);
    expect(focus.getValue().active).toBe(true);
    focus.clear();
    expect(focus.getValue().active).toBe(false);
});

test("custom unpicked clear events hit-test entries rather than stale hover", async () => {
    const input = panel("source", [
        {
            name: "focus",
            bind: "legend",
            select: {
                type: "point",
                encodings: ["color"],
                clear: "mousedown[event.altKey]",
            },
            value: [{ color: "A" }],
        },
    ]);
    const { root, views, context } = await createTestEmbed({
        config: { legend: { disable: false, padding: 8 } },
        vconcat: [input],
    });
    renderToLayout(root);
    const legend = root
        .getDescendants()
        .find((view) => view instanceof LegendView);
    const entry = /** @type {UnitView} */ (
        legend.getDescendants().find((view) => view.name === "entries")
    );
    const row = Array.from(entry.getCollector().getData())[1];
    context.getCurrentHover = () => ({ mark: entry.mark, datum: row });
    const focus = views
        .get({ scope: [], view: "source" })
        .params.getSelection("focus");
    const send = (/** @type {Point} */ point) =>
        legend.handleInteraction(
            new Interaction(
                point,
                new MouseEvent("mousedown", { altKey: true })
            ),
            false
        );
    send(new Point(legend.coords.x + 1, legend.coords.y + 1));
    expect(focus.getValue().active).toBe(true);
    send(new Point(entry.coords.x + row.labelX, entry.coords.y + row.labelY));
    expect(focus.getValue().active).toBe(false);
});

test("domain reorder, removal, and new entries preserve selection identity and feedback", async () => {
    const input = panel("source", [
        {
            name: "focus",
            bind: "legend",
            select: { type: "point", encodings: ["color"] },
            value: [{ color: "A" }],
        },
        { name: "categories", value: ["A", "B"] },
    ]);
    input.encoding.color = {
        field: "group",
        type: "nominal",
        scale: { domain: { expr: "categories" } },
    };
    const { root, views } = await createTestEmbed({
        config: { legend: { disable: false, symbolOpacity: 1 } },
        vconcat: [input],
    });
    const source = views.get({ scope: [], view: "source" });
    const focus = source.params.getSelection("focus");
    if (focus.type !== "point" || focus.membership !== "categories")
        throw new Error("Expected categories");
    const legend = root
        .getDescendants()
        .find((view) => view instanceof LegendView);
    const symbols = /** @type {UnitView} */ (
        legend.getDescendants().find((view) => view.name === "symbols")
    );
    const feedback = () =>
        Array.from(symbols.getCollector().getData(), (row) => [
            row.value,
            symbols.mark.encoders.strokeOpacity(row),
        ]);
    const categories =
        /** @type {import("../types/embedApi.js").ParamApi<string[]>} */ (
            source.params.get("categories")
        );
    categories.setValue(["B", "A"]);
    await root.paramRuntime.whenPropagated();
    expect(feedback()).toEqual([
        ["B", 0.35],
        ["A", 1],
    ]);
    categories.setValue(["B"]);
    await root.paramRuntime.whenPropagated();
    expect(feedback()).toEqual([["B", 0.35]]);
    expect(focus.getValue().values).toEqual([["A"]]);
    focus.setValue([["later"]]);
    categories.setValue(["B", "later"]);
    await root.paramRuntime.whenPropagated();
    expect(feedback()).toEqual([
        ["B", 0.35],
        ["later", 1],
    ]);
});
