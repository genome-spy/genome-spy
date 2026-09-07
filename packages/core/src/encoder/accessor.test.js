import { describe, expect, test } from "vitest";

import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import {
    buildDomainKey,
    createAccessor,
    getAccessorDomainKey,
    isScaleAccessor,
} from "./accessor.js";
import { createConditionalBranches } from "./encoder.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import {
    createIntervalSelection,
    createSinglePointSelection,
} from "../selection/selection.js";

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

describe("createConditionalBranches", () => {
    const data = [
        { a: 1, b: 2, [UNIQUE_ID_KEY]: 0 },
        { a: 3, b: 4, [UNIQUE_ID_KEY]: 1 },
    ];

    const paramRuntime = new ViewParamRuntime(() => undefined);
    paramRuntime.allocateSetter("p", createSinglePointSelection(data[0]));

    /** @type {any} */
    const encodingA = {
        x: {
            field: "a",
            type: "quantitative",
            condition: { param: "p", value: 123 },
        },
    };

    const a = createConditionalBranches(
        "x",
        encodingA.x,
        encodingA,
        paramRuntime
    );

    /** @type {any} */
    const encodingB = {
        x: {
            field: "a",
            type: "quantitative",
            condition: [
                { param: "p", value: 123 },
                { param: "p", value: 234 },
            ],
        },
    };

    const b = createConditionalBranches(
        "x",
        encodingB.x,
        encodingB,
        paramRuntime
    );

    /** @type {any} */
    const encodingC = {
        x: {
            value: 123,
            condition: {
                param: "p",
                field: "a",
                type: "quantitative",
            },
        },
    };

    const c = createConditionalBranches(
        "x",
        encodingC.x,
        encodingC,
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
        expect(a[0].accessor(data[0])).toEqual(123);
        expect(a[0].predicate.param).toEqual("p");
    });

    test("Conditional predicate is true only for the selected datum", () => {
        expect(a[0].predicate(data[0])).toBeTruthy();
        expect(a[0].predicate(data[1])).toBeFalsy();
    });

    // Default accessor
    test("Default accessor accesses the correct field", () => {
        expect(a[1].accessor(data[0])).toEqual(1);
        expect(a[1].predicate.param).toBeFalsy();
    });

    test("Default predicate is true for all data", () => {
        expect(a[1].predicate(data[0])).toBeTruthy();
        expect(a[1].predicate(data[1])).toBeTruthy();
    });

    test("Throws if multiple non-constant accessors are used", () => {
        /** @type {any} */
        const invalidFieldConditionEncoding = {
            x: {
                field: "a",
                type: "quantitative",
                condition: {
                    param: "p",
                    field: "b",
                    type: "quantitative",
                },
            },
        };

        expect(() =>
            createConditionalBranches(
                "x",
                invalidFieldConditionEncoding.x,
                invalidFieldConditionEncoding,
                paramRuntime
            )
        ).toThrow();

        const invalidExprCondition = /** @type {any} */ ({
            field: "a",
            type: "quantitative",
            condition: {
                param: "p",
                expr: "datum.b",
                type: "quantitative",
            },
        });

        const invalidExprEncoding = /** @type {any} */ ({
            x: invalidExprCondition,
        });

        expect(() =>
            createConditionalBranches(
                "x",
                invalidExprCondition,
                invalidExprEncoding,
                paramRuntime
            )
        ).toThrow();
    });

    test("Interval selection predicate respects empty: false", () => {
        const intervalRuntime = new ViewParamRuntime(() => undefined);
        const setBrush = intervalRuntime.allocateSetter(
            "brush",
            createIntervalSelection(["x"])
        );
        setBrush({
            type: "interval",
            intervals: {
                x: [2, 4],
            },
        });

        /** @type {import("../spec/channel.js").Encoding} */
        const encoding = {
            x: {
                field: "x",
                type: "quantitative",
            },
            color: {
                value: "#ddd",
                condition: {
                    param: "brush",
                    empty: false,
                    value: "#38c",
                },
            },
        };

        const branches = createConditionalBranches(
            "color",
            encoding.color,
            encoding,
            intervalRuntime
        );

        expect(branches).toHaveLength(2);
        expect(branches[0].predicate.param).toBe("brush");
        expect(branches[0].predicate.empty).toBe(false);
    });

    test("Selection unions match all-empty and selected rows", () => {
        const unionRuntime = new ViewParamRuntime(() => undefined);
        const setA = unionRuntime.allocateSetter(
            "a",
            createSinglePointSelection(null)
        );
        const setB = unionRuntime.allocateSetter(
            "b",
            createSinglePointSelection(null)
        );
        const unionEncoding = /** @type {any} */ ({
            color: {
                value: "gray",
                condition: {
                    test: {
                        selection: { or: ["a", "b", "a"] },
                        empty: true,
                    },
                    value: "blue",
                },
            },
        });
        const branches = createConditionalBranches(
            "color",
            unionEncoding.color,
            unionEncoding,
            unionRuntime
        );

        expect(branches[0].predicate({ [UNIQUE_ID_KEY]: 0 })).toBe(true);
        setA(createSinglePointSelection({ [UNIQUE_ID_KEY]: 1 }));
        expect(branches[0].predicate({ [UNIQUE_ID_KEY]: 0 })).toBe(false);
        expect(branches[0].predicate({ [UNIQUE_ID_KEY]: 1 })).toBe(true);
        setB(createSinglePointSelection({ [UNIQUE_ID_KEY]: 0 }));
        expect(branches[0].predicate({ [UNIQUE_ID_KEY]: 0 })).toBe(true);
        expect(branches[0].predicate.selection.params).toEqual(["a", "b"]);
    });

    test("Selection unions support partial interval dimensions", () => {
        const intervalRuntime = new ViewParamRuntime(() => undefined);
        const setX = intervalRuntime.allocateSetter(
            "xBrush",
            createIntervalSelection(["x", "y"])
        );
        const setY = intervalRuntime.allocateSetter(
            "yBrush",
            createIntervalSelection(["x", "y"])
        );
        const unionEncoding = /** @type {any} */ ({
            x: { field: "x", type: "quantitative" },
            y: { field: "y", type: "quantitative" },
            color: {
                value: "gray",
                condition: {
                    test: {
                        selection: { or: ["xBrush", "yBrush"] },
                        empty: false,
                    },
                    value: "blue",
                },
            },
        });
        const predicate = createConditionalBranches(
            "color",
            unionEncoding.color,
            unionEncoding,
            intervalRuntime
        )[0].predicate;

        setX({ type: "interval", intervals: { x: [1, 2], y: null } });
        expect(predicate({ x: 1.5, y: 100 })).toBe(true);
        expect(predicate({ x: 3, y: 100 })).toBe(false);
        setY({ type: "interval", intervals: { x: null, y: [4, 5] } });
        expect(predicate({ x: 100, y: 4.5 })).toBe(true);
        expect(predicate({ x: 100, y: 8 })).toBe(false);
    });

    test("Selection union interval predicates use the requested endpoint hit test", () => {
        const runtime = new ViewParamRuntime(() => undefined);
        const setBrush = runtime.allocateSetter(
            "brush",
            createIntervalSelection(["x"])
        );
        setBrush({ type: "interval", intervals: { x: [15, 16] } });
        const encoding = /** @type {any} */ ({
            x: { field: "x", type: "quantitative" },
            x2: { field: "x2", type: "quantitative" },
            color: {
                value: "gray",
                condition: {
                    test: { selection: { or: ["brush"] }, empty: false },
                    value: "blue",
                },
            },
        });
        const predicate = createConditionalBranches(
            "color",
            encoding.color,
            encoding,
            runtime,
            "endpoints"
        )[0].predicate;

        expect(predicate({ x: 10, x2: 20 })).toBe(false);
        expect(predicate({ x: 15, x2: 20 })).toBe(true);
    });

    test("Selection union rejects malformed predicates", () => {
        const runtime = new ViewParamRuntime(() => undefined);
        const make = (/** @type {any} */ test) => () =>
            createConditionalBranches(
                "color",
                { value: "gray", condition: { test, value: "blue" } },
                {
                    color: {
                        value: "gray",
                        condition: { test, value: "blue" },
                    },
                },
                runtime
            );
        expect(make({ selection: { or: [] } })).toThrow(/nonempty/);
        expect(make({ selection: { or: ["a", 1] } })).toThrow(/strings/);
        expect(() =>
            createConditionalBranches(
                "color",
                /** @type {any} */ ({
                    value: "gray",
                    condition: {
                        test: { selection: { or: ["a"] } },
                        empty: false,
                        value: "blue",
                    },
                }),
                {},
                runtime
            )
        ).toThrow(/inside/);
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
