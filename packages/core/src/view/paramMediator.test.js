import { describe, expect, test } from "vitest";
import ParamMediator, { activateExprRefProps } from "./paramMediator.js";

describe("Single-level ParamMediator", () => {
    test("Trivial case", () => {
        const pm = new ParamMediator();
        pm.registerParam({ name: "foo", value: 42 });
        expect(pm.getValue("foo")).toBe(42);
    });

    test("Setter", () => {
        const pm = new ParamMediator();
        const setter = pm.allocateSetter("foo", 42);
        expect(pm.getValue("foo")).toBe(42);

        setter(43);
        expect(pm.getValue("foo")).toBe(43);
    });

    test("Expressions have access to parameters", () => {
        const pm = new ParamMediator();
        pm.registerParam({ name: "foo", value: 42 });
        const expr = pm.createExpression("foo + 1");
        expect(expr()).toBe(43);
    });

    test("Throws on an unknown parameter", () => {
        const pm = new ParamMediator();
        expect(() => pm.createExpression("foo")).toThrow();
    });

    test("Listener on an expression gets called (only) when a parameter changes", () => {
        const pm = new ParamMediator();
        const setter = pm.allocateSetter("foo", 42);
        const expr = pm.createExpression("foo + 1");

        let result;
        let calls = 0;

        expr.addListener(() => {
            result = expr();
            calls++;
        });

        setter(50);
        expect(result).toBe(51);
        expect(calls).toBe(1);

        setter(60);
        expect(result).toBe(61);
        expect(calls).toBe(2);

        setter(60);
        expect(result).toBe(61);
        expect(calls).toBe(2);
    });

    test("Expression invalidation", () => {
        const pm = new ParamMediator();
        const setter = pm.allocateSetter("foo", 42);
        const expr = pm.createExpression("foo + 1");

        let result = expr();
        expect(result).toBe(43);

        expr.addListener(() => (result = expr()));

        setter(50);
        expect(result).toBe(51);

        expr.invalidate();
        // Listeners should be invalidated now: the result must remain the same.
        setter(60);
        expect(result).toBe(51);
    });

    test("Expression parameter handles dependencies", () => {
        const pm = new ParamMediator();
        const setter = pm.registerParam({ name: "foo", value: 42 });
        pm.registerParam({ name: "bar", expr: "foo + 1" });
        pm.registerParam({ name: "baz", expr: "bar + 2" });

        const expr = pm.createExpression("baz");

        let result = expr();
        expect(result).toBe(45);

        expr.addListener(() => (result = expr()));

        setter(52);
        expect(result).toBe(55);
    });

    test("Throws if both value and expr are provided", () => {
        const pm = new ParamMediator();
        expect(() =>
            pm.registerParam({ name: "foo", value: 42, expr: "bar" })
        ).toThrow();
    });
});

describe("Nested ParamMediators", () => {
    test("Value in parent", () => {
        const parent = new ParamMediator();
        const child = new ParamMediator(() => parent);

        parent.registerParam({ name: "foo", value: 42 });
        expect(parent.findValue("foo")).toBe(42);
        expect(child.findValue("foo")).toBe(42);
    });

    test("Value in child", () => {
        const parent = new ParamMediator();
        const child = new ParamMediator(() => parent);

        child.registerParam({ name: "foo", value: 42 });
        expect(parent.findValue("foo")).toBeUndefined();
        expect(child.findValue("foo")).toBe(42);
    });

    test("Child overrides parent", () => {
        const parent = new ParamMediator();
        const child = new ParamMediator(() => parent);

        parent.registerParam({ name: "foo", value: 1 });
        child.registerParam({ name: "foo", value: 2 });

        expect(parent.findValue("foo")).toBe(1);
        expect(child.findValue("foo")).toBe(2);
    });

    test("Expression", () => {
        const parent = new ParamMediator();
        const child = new ParamMediator(() => parent);

        parent.registerParam({ name: "foo", value: 1 });
        child.registerParam({ name: "bar", value: 2 });

        const expr = child.createExpression("foo + bar");
        expect(expr()).toBe(3);
    });

    test("Listener on an expression", () => {
        const parent = new ParamMediator();
        const child = new ParamMediator(() => parent);

        const parentSetter = parent.allocateSetter("foo", 1);
        const childSetter = parent.allocateSetter("bar", 2);

        const expr = child.createExpression("foo + bar");

        let result = expr();
        expr.addListener(() => (result = expr()));

        expect(result).toBe(3);

        parentSetter(10);
        expect(result).toBe(12);

        childSetter(20);
        expect(result).toBe(30);
    });
});

test("activateExprRefProps", async () => {
    const pm = new ParamMediator();

    const fooSetter = pm.registerParam({ name: "foo", value: 7 });
    const barSetter = pm.registerParam({ name: "bar", value: 11 });

    /** @type {Record<string, any | import("../spec/parameter.js").ExprRef} */
    const props = {
        a: 42,
        b: { expr: "foo" },
        c: { expr: "bar" },
    };

    /** @type {string[]} */
    let altered = [];

    const activatedProps = activateExprRefProps(pm, props, (props) => {
        altered = props;
    });

    expect(activatedProps).toEqual({
        a: 42,
        b: 7,
        c: 11,
    });

    fooSetter(8);

    // Let the scheduled microtask call the listener
    await Promise.resolve();

    expect(altered).toEqual(["b"]);

    fooSetter(1);
    barSetter(2);

    // Let the scheduled microtask call the listener
    await Promise.resolve();

    expect(altered).toEqual(["b", "c"]);

    expect(activatedProps).toEqual({
        a: 42,
        b: 1,
        c: 2,
    });
});
