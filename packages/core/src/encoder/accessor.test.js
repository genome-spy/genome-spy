import { describe, expect, test } from "vitest";

import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import {
    buildDomainKey,
    createAccessor,
    createConditionalAccessors,
    getAccessorDomainKey,
    isScaleAccessor,
} from "./accessor.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import { createSinglePointSelection } from "../selection/selection.js";

const datum = {
    a: 1,
    b: 2,
    "x.c": 3,
};

describe("Accessors for different encoding types", () => {
    test("Creates a field accessor", () => {
        const a = createAccessor(
            "x",
            { field: "a" },
            new ViewParamRuntime(() => undefined)
        );
        expect(a(datum)).toEqual(1);
        expect(a.constant).toBeFalsy();
        expect(a.fields).toEqual(["a"]);
    });

    test("Creates an expression accessor", () => {
        const a = createAccessor(
            "x",
            { expr: `datum.b + datum['x\\.c']` },
            new ViewParamRuntime(() => undefined)
        );
        expect(a(datum)).toEqual(5);
        expect(a.constant).toBeFalsy();
        expect(a.fields.sort()).toEqual(["b", "x\\.c"].sort());
    });

    test("Creates a constant accessor", () => {
        const a = createAccessor(
            "x",
            { datum: 0 },
            new ViewParamRuntime(() => undefined)
        );
        expect(a(datum)).toEqual(0);
        expect(a.constant).toBeTruthy();
        expect(a.fields).toEqual([]);
    });

    test("Creates a value accessor", () => {
        const a = createAccessor(
            "x",
            { value: 123 },
            new ViewParamRuntime(() => undefined)
        );
        expect(a(datum)).toEqual(123);
        expect(a.constant).toBeTruthy();
        expect(a.fields).toEqual([]);
    });
});

describe("Accessor equality", () => {
    const paramRuntime = new ViewParamRuntime(() => undefined);

    test("Field accessors with the same field are equal", () => {
        const a = createAccessor("x", { field: "a" }, paramRuntime);
        const b = createAccessor("x", { field: "a" }, paramRuntime);
        expect(a.equals(b)).toBeTruthy();
    });

    test("Field accessors with different fields are not equal", () => {
        const a = createAccessor("x", { field: "a" }, paramRuntime);
        const b = createAccessor("x", { field: "b" }, paramRuntime);
        expect(a.equals(b)).toBeFalsy();
    });

    test("Expression accessors with the same expression are equal", () => {
        const a = createAccessor("x", { expr: "datum.a + 1" }, paramRuntime);
        const b = createAccessor("x", { expr: "datum.a + 1" }, paramRuntime);
        expect(a.equals(b)).toBeTruthy();
    });

    test("Expression accessors with different expressions are not equal", () => {
        const a = createAccessor("x", { expr: "datum.a + 1" }, paramRuntime);
        const b = createAccessor("x", { expr: "datum.a + 2" }, paramRuntime);
        expect(a.equals(b)).toBeFalsy();
    });

    test("Constant accessors with the same literal are equal", () => {
        const a = createAccessor("x", { datum: 5 }, paramRuntime);
        const b = createAccessor("x", { value: 5 }, paramRuntime);
        expect(a.equals(b)).toBeTruthy();
    });

    test("Constant accessors with different literals are not equal", () => {
        const a = createAccessor("x", { datum: 5 }, paramRuntime);
        const b = createAccessor("x", { value: 6 }, paramRuntime);
        expect(a.equals(b)).toBeFalsy();
    });

    test("Expression references compare by expression string", () => {
        const a = createAccessor(
            "x",
            { datum: { expr: "1 + 1" } },
            paramRuntime
        );
        const b = createAccessor(
            "x",
            { value: { expr: "1 + 1" } },
            paramRuntime
        );
        const c = createAccessor(
            "x",
            { value: { expr: "1 + 2" } },
            paramRuntime
        );
        expect(a.equals(b)).toBeTruthy();
        expect(a.equals(c)).toBeFalsy();
    });
});

test("Throws on incomplete encoding spec", () => {
    expect(() =>
        createAccessor("x", {}, new ViewParamRuntime(() => undefined))
    ).toThrow();
});

// TODO: Refactor and fix conditional accessors
describe.skip("createConditionalAccessors", () => {
    const data = [
        { a: 1, b: 2, [UNIQUE_ID_KEY]: 0 },
        { a: 3, b: 4, [UNIQUE_ID_KEY]: 1 },
    ];

    const paramRuntime = new ViewParamRuntime(() => undefined);
    paramRuntime.allocateSetter("p", createSinglePointSelection(data[0]));

    const a = createConditionalAccessors(
        "x",
        {
            field: "a",
            type: "quantitative",
            condition: { param: "p", value: 123 },
        },
        paramRuntime
    );

    const b = createConditionalAccessors(
        "x",
        {
            field: "a",
            type: "quantitative",
            condition: [
                { param: "p", value: 123 },
                { param: "p", value: 234 },
            ],
        },
        paramRuntime
    );

    const c = createConditionalAccessors(
        "x",
        {
            value: 123,
            condition: {
                param: "p",
                field: "a",
                type: "quantitative",
            },
        },
        paramRuntime
    );

    // TODO: Add more combinations of datum, field, expr, etc

    test("Creates a correct number of accessors", () => {
        expect(a.length).toBe(2);
        expect(b.length).toBe(3);
        expect(c.length).toBe(2);
    });

    // Conditional accessor
    test("Conditional accessor accesses the correct field", () => {
        expect(a[0](data[0])).toEqual(123);
        expect(a[0].predicate.param).toEqual("p");
    });

    test("Conditional predicate is true only for the selected datum", () => {
        expect(a[0].predicate(data[0])).toBeTruthy();
        expect(a[0].predicate(data[1])).toBeFalsy();
    });

    // Default accessor
    test("Default accessor accesses the correct field", () => {
        expect(a[1](data[0])).toEqual(1);
        expect(a[1].predicate.param).toBeFalsy();
    });

    test("Default predicate is true for all data", () => {
        expect(a[1].predicate(data[0])).toBeTruthy();
        expect(a[1].predicate(data[1])).toBeTruthy();
    });

    test("Throws if multiple non-constant accessors are used", () => {
        expect(() =>
            createConditionalAccessors(
                "x",
                {
                    field: "a",
                    type: "quantitative",
                    condition: {
                        param: "p",
                        field: "b",
                        type: "quantitative",
                    },
                },
                paramRuntime
            )
        ).toThrow();

        expect(() =>
            createConditionalAccessors(
                "x",
                {
                    field: "a",
                    type: "quantitative",
                    condition: {
                        param: "p",
                        // @ts-expect-error
                        expr: "datum.b",
                        type: "quantitative",
                    },
                },
                paramRuntime
            )
        ).toThrow();
    });
});

describe("Accessor domain keys", () => {
    /** @type {Array<{
     *  name: string,
     *  channel: import("../spec/channel.js").Channel,
     *  channelDef: import("../spec/channel.js").ChannelDef,
     *  resolvedType: import("../spec/channel.js").Type,
     *  expectedBase: string,
     *  expectedKey: string,
     * }>} */
    const cases = [
        {
            name: "field definitions",
            channel: "x",
            channelDef: { field: "value", type: "quantitative" },
            resolvedType: "quantitative",
            expectedBase: "x|field|value",
            expectedKey: "quantitative|x|field|value",
        },
        {
            name: "expression definitions",
            channel: "y",
            channelDef: { expr: "datum.value + 1", type: "quantitative" },
            resolvedType: "quantitative",
            expectedBase: "y|expr|datum.value + 1",
            expectedKey: "quantitative|y|expr|datum.value + 1",
        },
        {
            name: "datum values",
            channel: "x",
            channelDef: { datum: 123, type: "quantitative" },
            resolvedType: "quantitative",
            expectedBase: "x|datum|123",
            expectedKey: "quantitative|x|datum|123",
        },
    ];

    test.each(cases)(
        "$name",
        ({ channel, channelDef, resolvedType, expectedBase, expectedKey }) => {
            // ViewParamRuntime is required even when accessors only read fields.
            const paramRuntime = new ViewParamRuntime(() => undefined);
            const accessor = createAccessor(channel, channelDef, paramRuntime);

            expect(accessor.domainKeyBase).toBe(expectedBase);
            if (!isScaleAccessor(accessor)) {
                throw new Error(
                    "Expected a scale accessor for " + channel + " channel."
                );
            }
            expect(getAccessorDomainKey(accessor, resolvedType)).toBe(
                expectedKey
            );
        }
    );

    test("value literals are encoded in domain keys", () => {
        const scaleChannel =
            /** @type {import("../spec/channel.js").ChannelWithScale} */ ("x");
        const type = /** @type {import("../spec/channel.js").Type} */ (
            "nominal"
        );
        const { domainKeyBase, domainKey } = buildDomainKey({
            scaleChannel,
            source: { kind: "value", value: "blue" },
            type,
        });

        expect(domainKeyBase).toBe('x|value|"blue"');
        expect(domainKey).toBe('nominal|x|value|"blue"');
    });
});
