// @vitest-environment jsdom

import { expect, test, vi } from "vitest";
import { createTestEmbed } from "./embedTestUtils.js";
import LegendView from "./legendView.js";
import UnitView from "./unitView.js";
import Interaction from "../utils/interaction.js";
import Point from "./layout/point.js";
import { createProjectedSelection } from "../selection/projectedSelection.js";

const rows = [
    { group: "A", x: 1 },
    { group: "A", x: 2 },
    { group: "B", x: 3 },
];

/** @returns {import("../spec/view.js").HConcatSpec & import("../spec/root.js").RootConfig} */
function spec() {
    return {
        params: [
            {
                name: "focus",
                select: { type: "point", fields: ["group"] },
                bind: "legend",
            },
        ],
        data: { values: rows },
        hconcat: ["left", "right"].map(
            (name) =>
                /** @type {import("../spec/view.js").UnitSpec} */ ({
                    name,
                    width: 200,
                    height: 150,
                    mark: { type: "point", tooltip: null, filled: true },
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        color: {
                            field: "group",
                            type: "nominal",
                            scale: {
                                domain: ["A", "B", "C"],
                                range: ["red", "blue", "green"],
                            },
                            legend: { orient: "bottom" },
                        },
                        fillOpacity: {
                            condition: { param: "focus", value: 0.85 },
                            value: 0.12,
                        },
                    },
                })
        ),
        resolve: { scale: { color: "shared" }, legend: { color: "collected" } },
    };
}

/** @param {ReturnType<typeof spec>} [input] */
async function legendFixture(input = spec()) {
    const result = await createTestEmbed(input, {
        contextOptions: { viewFactoryOptions: { wrapRoot: true } },
    });
    const entryView = result.root
        .getDescendants()
        .filter((view) => view instanceof UnitView)
        .find((view) => view.name === "entries");
    const legend = entryView
        ?.getLayoutAncestors()
        .find((view) => view instanceof LegendView);
    const selection = result.views
        .get({ scope: [], view: "left" })
        .params.getSelection("focus");
    if (selection.type !== "projected")
        throw new Error("Expected field selection");
    return { ...result, entryView, legend, selection };
}

test("legend clicks select values across panels without replaying data or shrinking guides", async () => {
    const { root, context, views } = await createTestEmbed(spec(), {
        contextOptions: { viewFactoryOptions: { wrapRoot: true } },
    });
    const legends = root
        .getDescendants()
        .filter((view) => view instanceof LegendView);
    expect(legends).toHaveLength(1);
    const legend = legends[0];
    const entryView = legend
        .getDescendants()
        .filter((view) => view instanceof UnitView)
        .find((view) => view.name === "entries");
    expect(entryView).toBeDefined();
    const entries = Array.from(entryView.getCollector().getData());
    expect(entries.map((row) => row.value)).toEqual(["A", "B", "C"]);
    const left = views.get({ scope: [], view: "left" });
    const selection = left.params.getSelection("focus");
    expect(selection.type).toBe("projected");
    const sources = root
        .getDescendants()
        .filter((view) => view instanceof UnitView)
        .filter((view) => ["left", "right"].includes(view.name));
    const collectors = sources.map((view) => view.getCollector());
    const before = collectors.map((collector) =>
        Array.from(collector.getData())
    );
    const replays = collectors.map((collector) =>
        vi.spyOn(collector, "repropagate")
    );
    const [a, b] = before[0].filter((row) => row.x !== 2);
    const opacities = () =>
        sources.map((view) => [
            view.mark.encoders.fillOpacity(a),
            view.mark.encoders.fillOpacity(b),
        ]);
    expect(opacities()).toEqual([
        [0.85, 0.85],
        [0.85, 0.85],
    ]);
    const click = (/** @type {string} */ value, shiftKey = false) => {
        context.getCurrentHover = () => ({
            mark: entryView.mark,
            datum: entries.find((row) => row.value === value),
        });
        const event = new Interaction(
            new Point(0, 0),
            new MouseEvent("click", { shiftKey })
        );
        legend.handleInteraction(event, false);
        expect(event.stopped).toBe(true);
    };
    click("A");
    expect(selection.getValue()).toEqual({
        type: "projected",
        active: true,
        fields: ["group"],
        values: [["A"]],
    });
    expect(opacities()).toEqual([
        [0.85, 0.12],
        [0.85, 0.12],
    ]);
    click("B", true);
    expect(opacities()).toEqual([
        [0.85, 0.85],
        [0.85, 0.85],
    ]);
    click("A", true);
    expect(opacities()).toEqual([
        [0.12, 0.85],
        [0.12, 0.85],
    ]);
    click("C");
    expect(opacities()).toEqual([
        [0.12, 0.12],
        [0.12, 0.12],
    ]);
    selection.clear();
    expect(opacities()).toEqual([
        [0.85, 0.85],
        [0.85, 0.85],
    ]);
    for (let i = 0; i < sources.length; i++) {
        expect(Array.from(collectors[i].getData())).toEqual(before[i]);
        expect(sources[i].getScaleResolution("color").getDomain()).toEqual([
            "A",
            "B",
            "C",
        ]);
        expect(replays[i]).not.toHaveBeenCalled();
        expect(sources[i].mark.encoding.uniqueId).toBeUndefined();
    }
    expect(
        Array.from(entryView.getCollector().getData(), (row) => row.value)
    ).toEqual(["A", "B", "C"]);
    const snapshot = selection.getValue();
    expect(snapshot.type).toBe("projected");
});

test.each([{ fields: [] }, { fields: ["a", "b"] }, { fields: [""] }])(
    "rejects unsupported field projections $fields",
    ({ fields }) => {
        expect(() => createProjectedSelection(fields)).toThrow("exactly one");
    }
);

test("projected API values are detached, typed and independent of source identities", async () => {
    const { views } = await createTestEmbed(spec(), {
        contextOptions: { viewFactoryOptions: { wrapRoot: true } },
    });
    const selection = views
        .get({ scope: [], view: "left" })
        .params.getSelection("focus");
    if (selection.type !== "projected")
        throw new Error("Expected projected selection");
    selection.setValue([[1], ["1"], [false], [1]]);
    expect(selection.getValue().values).toEqual([[1], ["1"], [false]]);
    const snapshot = selection.getValue();
    /** @type {any} */ (snapshot.values)[0][0] = 99;
    expect(selection.getValue().values[0]).toEqual([1]);
    expect(() => selection.setValue([[NaN]])).toThrow("finite scalar");
    expect(() => selection.setValue([["A", "B"]])).toThrow("one finite");
});

test("a projected selection filters native data while an explicit domain keeps all legend entries", async () => {
    const input = spec();
    const panel = /** @type {import("../spec/view.js").UnitSpec} */ (
        input.hconcat[1]
    );
    input.data = {
        values: rows.map((row) => ({ ...row, renamedGroup: row.group })),
    };
    panel.transform = [
        { type: "filter", param: "focus", fields: { group: "renamedGroup" } },
    ];
    const { root, views } = await createTestEmbed(input, {
        contextOptions: { viewFactoryOptions: { wrapRoot: true } },
    });
    const filtered = root
        .getDescendants()
        .filter((view) => view instanceof UnitView)
        .find((view) => view.name === "right");
    const values = () =>
        Array.from(filtered.getCollector().getData(), (row) => row.group);
    const selection = views
        .get({ scope: [], view: "left" })
        .params.getSelection("focus");
    if (selection.type !== "projected")
        throw new Error("Expected field selection");
    expect(values()).toEqual(["A", "A", "B"]);
    selection.setValue([["B"]]);
    await root.paramRuntime.whenPropagated();
    expect(values()).toEqual(["B"]);
    expect(filtered.getScaleResolution("color").getDomain()).toEqual([
        "A",
        "B",
        "C",
    ]);
    selection.clear();
    await root.paramRuntime.whenPropagated();
    expect(values()).toEqual(["A", "A", "B"]);
});

test("a same-field size guide can coexist with a bound color legend", async () => {
    const input = spec();
    const panel = /** @type {import("../spec/view.js").UnitSpec} */ (
        input.hconcat[0]
    );
    panel.encoding.size = {
        field: "group",
        type: "nominal",
        scale: { type: "ordinal", domain: ["A", "B"], range: [30, 90] },
    };
    const { root, selection, entryView } = await legendFixture(input);
    expect(
        root.getDescendants().filter((view) => view instanceof LegendView)
    ).toHaveLength(2);
    expect(entryView).toBeDefined();
    selection.setValue([["A"]]);
    expect(selection.getValue().values).toEqual([["A"]]);
});

test.each(/** @type {const} */ (["mouseover", "pointerover"]))(
    "legend %s uses native hover routing and clears on exit",
    async (on) => {
        const input = spec();
        input.params[0] = {
            name: "focus",
            select: {
                type: "point",
                fields: ["group"],
                on,
                clear: "mouseleave",
            },
            bind: "legend",
        };
        const { context, entryView, legend, selection } =
            await legendFixture(input);
        const datum = Array.from(entryView.getCollector().getData())[0];
        context.getCurrentHover = () => ({ mark: entryView.mark, datum });
        legend.handleInteraction(
            new Interaction(new Point(0, 0), new MouseEvent("mousemove")),
            false
        );
        expect(selection.getValue().values).toEqual([["A"]]);
        legend.handleInteraction(
            new Interaction(new Point(0, 0), new MouseEvent("mouseleave")),
            false
        );
        expect(selection.getValue().values).toEqual([]);
    }
);

test("legend wheel bindings claim native zoom gestures before delivery", async () => {
    const input = spec();
    input.params[0] = {
        name: "focus",
        select: {
            type: "point",
            fields: ["group"],
            on: "wheel[event.ctrlKey]",
            clear: "wheel[!event.ctrlKey]",
        },
        bind: "legend",
    };
    const { context, entryView, legend, selection } =
        await legendFixture(input);
    context.getCurrentHover = () => ({
        mark: entryView.mark,
        datum: Array.from(entryView.getCollector().getData())[0],
    });
    for (const ctrlKey of [true, false]) {
        const probe = new Interaction(
            new Point(0, 0),
            new WheelEvent("wheel", { ctrlKey }),
            "wheelclaimprobe"
        );
        legend.handleInteraction(probe, false);
        expect(probe.wheelClaimed).toBe(true);
        expect(probe.wheelSmooth).toBe(false);
        legend.handleInteraction(
            new Interaction(
                new Point(0, 0),
                new WheelEvent("wheel", { ctrlKey })
            ),
            false
        );
        expect(selection.getValue().values).toEqual(ctrlKey ? [["A"]] : []);
    }
});

test.each([false, true])(
    "legend focus preserves the configured opacity (override: %s)",
    async (override) => {
        const input = spec();
        input.params.push({ name: "alpha", value: 0.2 });
        const panel = /** @type {import("../spec/view.js").UnitSpec} */ (
            input.hconcat[0]
        );
        panel.mark = {
            type: "point",
            tooltip: null,
            filled: true,
            opacity: { expr: "alpha" },
        };
        input.hconcat = [panel];
        delete panel.encoding.fillOpacity;
        if (override && "legend" in panel.encoding.color) {
            panel.encoding.color.legend = {
                ...panel.encoding.color.legend,
                symbolOpacity: 1,
            };
        }
        const { root, views, selection } = await legendFixture(input);
        const symbols = root
            .getDescendants()
            .filter((view) => view instanceof UnitView)
            .find((view) => view.name === "symbols");
        const entries = Array.from(symbols.getCollector().getData());
        const opacity = () =>
            entries.map((row) => symbols.mark.encoders.fillOpacity(row));
        expect(opacity()).toEqual([
            override ? 1 : 0.2,
            override ? 1 : 0.2,
            override ? 1 : 0.2,
        ]);
        selection.setValue([["A"]]);
        expect(opacity()[0]).toBe(override ? 1 : 0.2);
        expect(opacity()[1]).toBeCloseTo((override ? 1 : 0.2) * 0.35);
        views
            .get({ scope: [], view: "left" })
            .params.get("alpha")
            .setValue(0.5);
        await root.paramRuntime.whenPropagated();
        expect(opacity()[0]).toBe(override ? 1 : 0.5);
        expect(opacity()[1]).toBeCloseTo((override ? 1 : 0.5) * 0.35);
    }
);

test.each(["constructor", "toString", "__proto__"])(
    "projected filters preserve field %s without inherited remapping",
    async (name) => {
        const input = spec();
        input.params[0] = {
            name: "focus",
            select: { type: "point", fields: [name] },
            bind: "legend",
        };
        input.data = {
            values: rows.map((row) => ({ ...row, [name]: row.group })),
        };
        const panel = /** @type {import("../spec/view.js").UnitSpec} */ (
            input.hconcat[1]
        );
        panel.transform = [{ type: "filter", param: "focus" }];
        const { root, selection } = await legendFixture(input);
        selection.setValue([["B"]]);
        await root.paramRuntime.whenPropagated();
        const filtered = root
            .getDescendants()
            .filter((view) => view instanceof UnitView)
            .find((view) => view.name === "right");
        expect(
            Array.from(filtered.getCollector().getData(), (row) => row.x)
        ).toEqual([3]);
    }
);

test("moving between legends retains the destination hover while explicit clear remains unconditional", async () => {
    const input = spec();
    input.params[0] = {
        name: "focus",
        select: {
            type: "point",
            fields: ["group"],
            on: "mouseover",
            clear: "dblclick",
        },
        bind: "legend",
    };
    input.resolve.legend.color = "independent";
    const { root, context, selection } = await legendFixture(input);
    const legends = root
        .getDescendants()
        .filter((view) => view instanceof LegendView);
    expect(legends).toHaveLength(2);
    const hover = (
        /** @type {LegendView} */ legend,
        /** @type {string} */ group
    ) => {
        const entries = legend
            .getDescendants()
            .filter((view) => view instanceof UnitView)
            .find((view) => view.name === "entries");
        context.getCurrentHover = () => ({
            mark: entries.mark,
            datum: Array.from(entries.getCollector().getData()).find(
                (row) => row.value === group
            ),
        });
        legend.handleInteraction(
            new Interaction(new Point(0, 0), new MouseEvent("mousemove")),
            false
        );
    };
    hover(legends[0], "A");
    hover(legends[1], "B");
    const outgoing = new Interaction(
        new Point(0, 0),
        new MouseEvent("mouseleave")
    );
    outgoing.pointedViews.set(legends[1], undefined);
    legends[0].handleInteraction(outgoing, false);
    expect(selection.getValue().values).toEqual([["B"]]);
    legends[0].handleInteraction(
        new Interaction(new Point(0, 0), new MouseEvent("dblclick")),
        false
    );
    expect(selection.getValue().values).toEqual([]);
    hover(legends[1], "B");
    legends[1].handleInteraction(
        new Interaction(new Point(0, 0), new MouseEvent("mouseleave")),
        false
    );
    expect(selection.getValue().values).toEqual([]);
});
