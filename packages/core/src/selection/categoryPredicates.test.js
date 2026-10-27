import { expect, test } from "vitest";
import { createTestEmbed } from "../view/embedTestUtils.js";
import UnitView from "../view/unitView.js";
import {
    collectSamplingSelections,
    compileSelectionPredicateTree,
} from "./selectionPredicateTree.js";

/** @param {import("../types/embedApi.js").ViewHandle} handle @param {string} [name] */
function categories(handle, name = "focus") {
    const api = handle.params.getSelection(name);
    if (api.type !== "point" || api.membership !== "categories")
        throw new Error("Expected categories.");
    return api;
}

/** @param {string} name @param {string} field @returns {import("../spec/view.js").UnitSpec} */
function panel(name, field = "state") {
    return {
        name,
        mark: { type: "point", tooltip: null },
        data: {
            values: [1, "1", false, "absent"].map((state, x) => ({
                [field]: state,
                x,
            })),
        },
        encoding: {
            x: { field: "x", type: "quantitative" },
            color: {
                field,
                type: "nominal",
                scale: {
                    domain: [1, "1", false, "absent"],
                    range: ["red", "red"],
                },
            },
            opacity: { condition: { param: "focus", value: 1 }, value: 0.1 },
            order: { condition: { param: "focus", value: 1 }, value: 0 },
        },
    };
}

test("native categories bind per consumer and agree with order and explicit filters", async () => {
    const source = panel("source");
    source.params = [
        {
            name: "focus",
            select: { type: "point", encodings: ["color"] },
            push: "outer",
        },
    ];
    const filtered = panel("filtered", "activation");
    filtered.transform = [
        { type: "filter", param: "focus", fields: { color: "activation" } },
    ];
    const mapped = panel("mapped", "activation");
    mapped.encoding.shape = {
        field: "activation",
        type: "ordinal",
        legend: null,
        scale: { domain: [1, "1", false, "absent"], range: ["circle"] },
    };
    mapped.encoding.opacity = {
        condition: { param: "focus", project: { color: "shape" }, value: 1 },
        value: 0.1,
    };
    const { root, views } = await createTestEmbed({
        params: [
            { name: "focus", select: { type: "point", encodings: ["color"] } },
        ],
        hconcat: [source, panel("reader", "activation"), mapped, filtered],
    });
    const api = categories(views.root());
    api.setValue([["1"]]);
    await root.paramRuntime.whenPropagated();
    const units = root
        .getDescendants()
        .filter((view) => view instanceof UnitView);
    for (const unit of units.filter((unit) =>
        ["source", "reader", "mapped"].includes(unit.name)
    )) {
        const rows = Array.from(unit.getCollector().getData());
        expect(rows.map((row) => unit.mark.encoders.fillOpacity(row))).toEqual([
            0.1, 1, 0.1, 0.1,
        ]);
        expect(rows.map((row) => unit.mark.getOrder().predicate(row))).toEqual([
            false,
            true,
            false,
            false,
        ]);
    }
    const result = units.find((unit) => unit.name === "filtered");
    expect(
        Array.from(result.getCollector().getData(), (row) => row.activation)
    ).toEqual(["1"]);
    expect(
        units.find((unit) => unit.name === "reader").mark.encoders.uniqueId
    ).toBeUndefined();
    expect(api.getValue().encodings).toEqual(["color"]);
    api.setValue([["not loaded"]]);
    await root.paramRuntime.whenPropagated();
    expect(api.getValue().active).toBe(true);
    expect(Array.from(result.getCollector().getData())).toEqual([]);
    api.clear();
    await root.paramRuntime.whenPropagated();
    expect(Array.from(result.getCollector().getData())).toHaveLength(4);
});

test("logical/named/union predicates and sampling keep their distinct contracts", async () => {
    const input = panel("cells");
    input.params = [
        { name: "focus", select: { type: "point", encodings: ["color"] } },
        { name: "other", select: { type: "point", encodings: ["shape"] } },
        { name: "picked", select: "point" },
    ];
    input.encoding.key = { field: "x" };
    input.encoding.shape = {
        field: "state",
        type: "nominal",
        scale: { domain: [1, "1", false, "absent"] },
    };
    input.predicates = {
        both: { and: [{ param: "focus" }, { param: "other" }] },
    };
    input.encoding.opacity = {
        condition: { test: { ref: "both" }, value: 1 },
        value: 0.1,
    };
    input.encoding.size = {
        condition: { test: { param: { or: ["focus", "other"] } }, value: 100 },
        value: 20,
    };
    input.encoding.strokeWidth = {
        condition: {
            test: { not: { and: [{ param: "picked" }, { param: "focus" }] } },
            value: 2,
        },
        value: 1,
    };
    const { root, views } = await createTestEmbed(input);
    const unit = /** @type {UnitView} */ (root);
    categories(views.root()).setValue([[1]]);
    categories(views.root(), "other").setValue([["1"]]);
    const picked = views.root().params.getSelection("picked");
    if (picked.type !== "point" || picked.membership !== "records")
        throw new Error("Expected records.");
    picked.setValue([[2]]);
    const rows = Array.from(unit.getCollector().getData());
    expect(rows.map((row) => unit.mark.encoders.fillOpacity(row))).toEqual([
        0.1, 0.1, 0.1, 0.1,
    ]);
    expect(rows.map((row) => unit.mark.encoders.size(row))).toEqual([
        100, 100, 20, 20,
    ]);
    const leaves = collectSamplingSelections([
        unit.mark.encoders.strokeWidth.branches[0].predicate.selection,
    ]);
    const matches = leaves.map((leaf) =>
        compileSelectionPredicateTree(leaf, (name) =>
            root.paramRuntime.findValue(name)
        )
    );
    expect(rows.map((row) => matches.some((match) => match(row)))).toEqual([
        false,
        false,
        true,
        false,
    ]);
    categories(views.root(), "other").clear();
    expect(rows.map((row) => unit.mark.encoders.size(row))).toEqual([
        100, 20, 20, 20,
    ]);
    picked.clear();
    expect(rows.some((row) => matches.some((match) => match(row)))).toBe(false);
});

test("category filters require fields and explicit consumer mappings cover the component", async () => {
    for (const fields of [
        undefined,
        { shape: "state" },
        { color: "state", shape: "state" },
    ]) {
        const input = panel("cells");
        input.params = [
            { name: "focus", select: { type: "point", encodings: ["color"] } },
        ];
        input.transform = [{ type: "filter", param: "focus", fields }];
        await expect(createTestEmbed(input)).rejects.toThrow(/fields/);
    }
    const input = panel("cells");
    input.params = [
        { name: "focus", select: { type: "point", encodings: ["color"] } },
    ];
    input.encoding.opacity = {
        condition: { param: "focus", project: { shape: "color" }, value: 1 },
        value: 0.1,
    };
    await expect(createTestEmbed(input)).rejects.toThrow(/declared component/);
});
