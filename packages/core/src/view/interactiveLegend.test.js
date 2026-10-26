// @vitest-environment jsdom

import { expect, test, vi } from "vitest";
import { createTestEmbed } from "./embedTestUtils.js";
import LegendView from "./legendView.js";
import UnitView from "./unitView.js";
import Interaction from "../utils/interaction.js";
import Point from "./layout/point.js";

const categories = ["A", "B", "C"];
/** @returns {import("../spec/parameter.js").PlainValueParameter} */
const focus = () => ({ name: "focus", value: [], bind: { legend: "color" } });

/**
 * @param {import("../spec/channel.js").Scalar[]} [domain]
 * @returns {import("../spec/view.js").HConcatSpec & import("../spec/root.js").RootConfig & {hconcat: import("../spec/view.js").UnitSpec[]}}
 */
function spec(domain = categories) {
    return {
        params: [focus()],
        data: {
            values: [
                { group: "A", x: 1 },
                { group: "B", x: 2 },
            ],
        },
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
                            scale: { domain: domain },
                            legend: { orient: "bottom" },
                        },
                        fillOpacity: {
                            field: "group",
                            type: "nominal",
                            legend: null,
                            scale: {
                                type: "ordinal",
                                domain: [...domain].reverse(),
                                reverse: false,
                                range: domain.map((_, i) => ({
                                    expr: `!length(focus) || indexof(focus, domain('fillOpacity')[${i}]) >= 0 ? 0.85 : 0.12`,
                                })),
                            },
                        },
                    },
                })
        ),
        resolve: {
            scale: { color: "shared", fillOpacity: "independent" },
            legend: { color: "collected" },
        },
    };
}

/** @param {ReturnType<typeof spec>} [input] */
async function fixture(input = spec()) {
    const result = await createTestEmbed(input, {
        contextOptions: { viewFactoryOptions: { wrapRoot: true } },
    });
    const legends = result.root
        .getDescendants()
        .filter((view) => view instanceof LegendView);
    const sources = result.root
        .getDescendants()
        .filter((view) => view instanceof UnitView)
        .filter((view) => ["left", "right"].includes(view.name));
    const param =
        /** @type {import("../types/embedApi.js").ParamApi<unknown>} */ (
            result.views.get({ scope: [], view: "left" }).params.get("focus")
        );
    const entries = (legend = legends[0]) =>
        legend
            .getDescendants()
            .filter((view) => view instanceof UnitView)
            .find((view) => view.name === "entries");
    const click = (
        /** @type {import("../spec/channel.js").Scalar} */ value,
        { shiftKey = false, type = "click", legend = legends[0] } = {}
    ) => {
        const entryView = entries(legend);
        result.context.getCurrentHover = () => ({
            mark: entryView.mark,
            datum: Array.from(entryView.getCollector().getData()).find(
                (row) => row.value === value
            ),
        });
        const event = new Interaction(
            new Point(0, 0),
            new MouseEvent(type, { shiftKey })
        );
        legend.handleInteraction(event, false);
        return event;
    };
    const opacity = () =>
        sources.map((view) =>
            Array.from(view.getCollector().getData(), (row) =>
                view.mark.encoders.fillOpacity(row)
            )
        );
    return { ...result, legends, sources, param, entries, click, opacity };
}

test("legend clicks update shared array state without replaying data or shrinking guides", async () => {
    const { legends, sources, param, entries, click, opacity } =
        await fixture();
    expect(legends).toHaveLength(1);
    const before = sources.map((view) =>
        Array.from(view.getCollector().getData())
    );
    const replays = sources.map((view) =>
        vi.spyOn(view.getCollector(), "repropagate")
    );
    const listener = vi.fn();
    const unsubscribe = param.subscribe(listener);
    expect(opacity()).toEqual([
        [0.85, 0.85],
        [0.85, 0.85],
    ]);
    expect(click("A").stopped).toBe(true);
    expect(param.getValue()).toEqual(["A"]);
    expect(opacity()).toEqual([
        [0.85, 0.12],
        [0.85, 0.12],
    ]);
    click("B", { shiftKey: true });
    expect(param.getValue()).toEqual(["A", "B"]);
    click("A", { shiftKey: true });
    expect(opacity()).toEqual([
        [0.12, 0.85],
        [0.12, 0.85],
    ]);
    click("C");
    expect(opacity()).toEqual([
        [0.12, 0.12],
        [0.12, 0.12],
    ]);
    click("C", { type: "dblclick" });
    expect(param.getValue()).toEqual([]);
    expect(opacity()).toEqual([
        [0.85, 0.85],
        [0.85, 0.85],
    ]);
    expect(listener).toHaveBeenCalledTimes(5);
    unsubscribe();
    for (const [i, view] of sources.entries()) {
        expect(Array.from(view.getCollector().getData())).toEqual(before[i]);
        expect(replays[i]).not.toHaveBeenCalled();
        expect(view.getScaleResolution("color").getDomain()).toEqual(
            categories
        );
        expect(view.mark.encoding.uniqueId).toBeUndefined();
    }
    expect(
        Array.from(entries().getCollector().getData(), (row) => row.value)
    ).toEqual(categories);
});

test("external array writes update legend feedback and reject invalid values before publication", async () => {
    const { param, legends, opacity } = await fixture();
    const label = legends[0]
        .getDescendants()
        .filter((view) => view instanceof UnitView)
        .find((view) => view.name === "labels");
    const row = Array.from(label.getCollector().getData()).find(
        (row) => row.value === "A"
    );
    const normal = Number(label.mark.encoders.opacity(row));
    param.setValue(["B"]);
    expect(label.mark.encoders.opacity(row)).toBeCloseTo(normal * 0.35);
    expect(opacity()).toEqual([
        [0.12, 0.85],
        [0.12, 0.85],
    ]);
    for (const bad of ["A", [NaN], [{}], [null]]) {
        expect(() => param.setValue(bad)).toThrow("array of finite scalar");
        expect(param.getValue()).toEqual(["B"]);
    }
    param.setValue([]);
    expect(label.mark.encoders.opacity(row)).toBe(normal);
});

test("independent same-field legends retain their own local parameters", async () => {
    const input = spec();
    input.params = [];
    input.resolve = {
        scale: { color: "independent", fillOpacity: "independent" },
        legend: { color: "collected" },
    };
    for (const panel of input.hconcat) panel.params = [focus()];
    const { legends, param, click, opacity, views } = await fixture(input);
    expect(legends).toHaveLength(2);
    click("A", { legend: legends[0] });
    expect(param.getValue()).toEqual(["A"]);
    expect(
        views.get({ scope: [], view: "right" }).params.get("focus").getValue()
    ).toEqual([]);
    expect(opacity()).toEqual([
        [0.85, 0.12],
        [0.85, 0.85],
    ]);
});

test("category identity survives formatting and reserved names", async () => {
    const values = [
        "constructor",
        "__proto__",
        "toString",
        'a"b\\c',
        1,
        "1",
        false,
    ];
    const input = spec(values);
    input.data = { values: values.map((group, x) => ({ group, x })) };
    const { click, param, opacity, entries } = await fixture(input);
    expect(
        Array.from(entries().getCollector().getData(), (row) => row.value)
    ).toEqual(values);
    for (const [i, value] of values.entries()) {
        click(value);
        expect(param.getValue()).toEqual([value]);
        const expected = values.map((_, j) => (j === i ? 0.85 : 0.12));
        expect(opacity()).toEqual([expected, expected]);
    }
});

test("continuous color legends cannot bind category arrays", async () => {
    const input = spec();
    for (const panel of input.hconcat)
        panel.encoding.color = { field: "x", type: "quantitative" };
    await expect(fixture(input)).rejects.toThrow("categorical color scale");
});

test("a sibling-local binding cannot take ownership of a shared scale", async () => {
    const input = spec();
    input.params = [{ name: "focus", value: [] }];
    input.hconcat[1].params = [focus()];
    await expect(fixture(input)).rejects.toThrow("share one parameter");
});

test("shadowing a shared legend's parameter is rejected", async () => {
    const input = spec();
    input.hconcat[1].params = [{ name: "focus", value: [] }];
    await expect(fixture(input)).rejects.toThrow("share one parameter");
});

test("root binding cannot guess among independent descendant scales", async () => {
    const input = spec();
    input.resolve.scale.color = "independent";
    await expect(fixture(input)).rejects.toThrow("no color scale");
});

test("a scale cannot bind competing parameters", async () => {
    const input = spec();
    input.params.push({ ...focus(), name: "other" });
    await expect(fixture(input)).rejects.toThrow("only one legend parameter");
});

test("legend bindings require explicit array values", async () => {
    const input = spec();
    input.params[0].value = "A";
    await expect(fixture(input)).rejects.toThrow("array of finite scalar");
});

test("disposed legends remove interaction listeners", async () => {
    const { click, finalize } = await fixture();
    finalize();
    expect(click("A").stopped).toBe(false);
});
