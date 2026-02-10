import { describe, expect, test } from "vitest";
import ViewParamRuntime, {
    activateExprRefProps,
} from "../paramRuntime/viewParamRuntime.js";

describe("Single-level ViewParamRuntime", () => {
    test("Trivial case", () => {
        const pm = new ViewParamRuntime();
        pm.registerParam({ name: "foo", value: 42 });
        expect(pm.getValue("foo")).toBe(42);
    });

    test("Setter", () => {
        const pm = new ViewParamRuntime();
        const setter = pm.allocateSetter("foo", 42);
        expect(pm.getValue("foo")).toBe(42);

        setter(43);
        expect(pm.getValue("foo")).toBe(43);
    });

    test("Subscribe notifies on value changes", () => {
        const pm = new ViewParamRuntime();
        const setter = pm.registerParam({ name: "foo", value: 1 });

        let calls = 0;
        const unsubscribe = pm.subscribe("foo", () => {
            calls++;
        });

        setter(2);
        setter(2);
        setter(3);

        expect(calls).toBe(2);

        unsubscribe();
        setter(4);
        expect(calls).toBe(2);
    });

    test("Expressions have access to parameters", () => {
        const pm = new ViewParamRuntime();
        pm.registerParam({ name: "foo", value: 42 });
        const expr = pm.createExpression("foo + 1");
        expect(expr()).toBe(43);
    });

    test("Throws on an unknown parameter", () => {
        const pm = new ViewParamRuntime();
        expect(() => pm.createExpression("foo")).toThrow();
    });

    test("Listener on an expression gets called (only) when a parameter changes", () => {
        const pm = new ViewParamRuntime();
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

    test("Passive parameter does not trigger listeners", () => {
        const pm = new ViewParamRuntime();
        const setter = pm.allocateSetter("foo", 42, true);
        const expr = pm.createExpression("foo");

        let result = expr();

        expr.addListener(() => (result = expr()));

        setter(50);
        expect(result).toBe(42);
    });

    test("Expression invalidation", () => {
        const pm = new ViewParamRuntime();
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

    test("Expression invalidation is instance-local", () => {
        const pm = new ViewParamRuntime();
        const setter = pm.allocateSetter("foo", 1);
        const exprA = pm.createExpression("foo + 1");
        const exprB = pm.createExpression("foo + 1");

        let callsA = 0;
        let callsB = 0;
        exprA.addListener(() => {
            callsA++;
        });
        exprB.addListener(() => {
            callsB++;
        });

        setter(2);
        expect(callsA).toBe(1);
        expect(callsB).toBe(1);

        exprA.invalidate();

        setter(3);
        expect(callsA).toBe(1);
        expect(callsB).toBe(2);
    });

    test("Expression removeListener detaches a listener", () => {
        const pm = new ViewParamRuntime();
        const setter = pm.allocateSetter("foo", 42);
        const expr = pm.createExpression("foo + 1");

        let calls = 0;

        const listener = () => {
            calls++;
        };

        expr.addListener(listener);

        setter(50);
        expect(calls).toBe(1);

        expr.removeListener(listener);

        setter(60);
        expect(calls).toBe(1);
    });

    test("Expression parameter handles dependencies", () => {
        const pm = new ViewParamRuntime();
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

    test("Subscribe tracks expression parameter changes", () => {
        const pm = new ViewParamRuntime();
        const setter = pm.registerParam({ name: "foo", value: 1 });
        pm.registerParam({ name: "bar", expr: "foo + 1" });

        let calls = 0;
        pm.subscribe("bar", () => {
            calls++;
        });

        setter(2);
        setter(2);

        expect(calls).toBe(1);
    });

    test("Derived params are read-only from registerParam setter", () => {
        const pm = new ViewParamRuntime();
        pm.registerParam({ name: "foo", value: 1 });
        const setter = pm.registerParam({ name: "bar", expr: "foo + 1" });

        expect(() => setter(123)).toThrow(
            'Cannot set derived parameter "bar".'
        );
    });

    test("inTransaction batches expression updates", async () => {
        const pm = new ViewParamRuntime();
        const setter = pm.registerParam({ name: "foo", value: 1 });
        pm.registerParam({ name: "bar", expr: "foo + 1" });

        let calls = 0;
        pm.subscribe("bar", () => {
            calls++;
        });

        // Non-obvious: runtime propagation is deferred until transaction end.
        pm.inTransaction(() => {
            setter(2);
            setter(3);
        });

        expect(calls).toBe(0);

        await pm.whenPropagated();

        expect(pm.getValue("bar")).toBe(4);
        expect(calls).toBe(1);
    });

    test("Throws if both value and expr are provided", () => {
        const pm = new ViewParamRuntime();
        expect(() =>
            pm.registerParam({ name: "foo", value: 42, expr: "bar" })
        ).toThrow();
    });

    test("dispose clears local scope and disables allocated setters", () => {
        const pm = new ViewParamRuntime();
        const setter = pm.registerParam({ name: "foo", value: 1 });

        expect(pm.getValue("foo")).toBe(1);

        pm.dispose();

        expect(pm.getValue("foo")).toBeUndefined();
        expect(() => setter(2)).toThrow();
    });

    test("watchExpression notifies on upstream changes", () => {
        const pm = new ViewParamRuntime();
        const setter = pm.registerParam({ name: "foo", value: 1 });

        let calls = 0;
        const expr = pm.watchExpression("foo + 1", () => {
            calls += 1;
        });

        expect(expr()).toBe(2);

        setter(2);
        setter(2);

        expect(calls).toBe(1);
        expect(expr()).toBe(3);
    });

    test("watchExpression supports owner-bound disposer semantics", () => {
        const pm = new ViewParamRuntime();
        const setter = pm.registerParam({ name: "foo", value: 1 });

        /** @type {(() => void)[]} */
        const disposers = [];
        let calls = 0;

        pm.watchExpression(
            "foo + 1",
            () => {
                calls += 1;
            },
            {
                scopeOwned: false,
                registerDisposer: (disposer) => disposers.push(disposer),
            }
        );

        expect(disposers.length).toBe(1);

        setter(2);
        expect(calls).toBe(1);

        disposers[0]();
        setter(3);
        expect(calls).toBe(1);
    });
});

describe("Nested ViewParamRuntimes", () => {
    test("Value in parent", () => {
        const parent = new ViewParamRuntime();
        const child = new ViewParamRuntime(() => parent);

        parent.registerParam({ name: "foo", value: 42 });
        expect(parent.findValue("foo")).toBe(42);
        expect(child.findValue("foo")).toBe(42);
    });

    test("Value in child", () => {
        const parent = new ViewParamRuntime();
        const child = new ViewParamRuntime(() => parent);

        child.registerParam({ name: "foo", value: 42 });
        expect(parent.findValue("foo")).toBeUndefined();
        expect(child.findValue("foo")).toBe(42);
    });

    test("Child overrides parent", () => {
        const parent = new ViewParamRuntime();
        const child = new ViewParamRuntime(() => parent);

        parent.registerParam({ name: "foo", value: 1 });
        child.registerParam({ name: "foo", value: 2 });

        expect(parent.findValue("foo")).toBe(1);
        expect(child.findValue("foo")).toBe(2);
    });

    test("Expression", () => {
        const parent = new ViewParamRuntime();
        const child = new ViewParamRuntime(() => parent);

        parent.registerParam({ name: "foo", value: 1 });
        child.registerParam({ name: "bar", value: 2 });

        const expr = child.createExpression("foo + bar");
        expect(expr()).toBe(3);
    });

    test("Listener on an expression", () => {
        const parent = new ViewParamRuntime();
        const child = new ViewParamRuntime(() => parent);

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

    test("Pushing to outer parameter", () => {
        const parent = new ViewParamRuntime();
        const child = new ViewParamRuntime(() => parent);

        parent.registerParam({ name: "foo", value: 1 });
        const childSetter = child.registerParam({ name: "foo", push: "outer" });

        expect(parent.findValue("foo")).toBe(1);
        expect(child.findValue("foo")).toBe(1);

        childSetter(2);

        expect(parent.findValue("foo")).toBe(2);
        expect(child.findValue("foo")).toBe(2);
    });

    test("watchExpression listener is detached when child scope is disposed", () => {
        const parent = new ViewParamRuntime();
        const child = new ViewParamRuntime(() => parent);

        const setter = parent.registerParam({ name: "foo", value: 1 });
        let calls = 0;
        child.watchExpression("foo + 1", () => {
            calls += 1;
        });

        setter(2);
        expect(calls).toBe(1);

        child.dispose();
        setter(3);
        expect(calls).toBe(1);
    });
});

test("activateExprRefProps", async () => {
    const pm = new ViewParamRuntime();

    const fooSetter = pm.registerParam({ name: "foo", value: 7 });
    const barSetter = pm.registerParam({ name: "bar", value: 11 });

    /** @type {Record<string, any | import("../spec/parameter.js").ExprRef>} */
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

test("activateExprRefProps registers disposer for expression listeners", async () => {
    const pm = new ViewParamRuntime();
    const fooSetter = pm.registerParam({ name: "foo", value: 1 });

    /** @type {(() => void)[]} */
    const disposers = [];

    let calls = 0;
    activateExprRefProps(
        pm,
        {
            value: { expr: "foo" },
        },
        () => {
            calls += 1;
        },
        (disposer) => disposers.push(disposer)
    );

    expect(disposers.length).toBe(1);

    fooSetter(2);
    await Promise.resolve();
    expect(calls).toBe(1);

    disposers[0]();

    fooSetter(3);
    await Promise.resolve();
    expect(calls).toBe(1);
});

describe("hasPointSelections()", () => {
    test("false if there are no point selections", () => {
        const pm = new ViewParamRuntime();
        pm.registerParam({ name: "foo", value: 42 });
        expect(pm.hasPointSelections()).toBe(false);
    });

    test("true if there are point selections (1/2)", () => {
        const pm = new ViewParamRuntime();
        pm.registerParam({ name: "foo", select: "point" });
        expect(pm.hasPointSelections()).toBe(true);
    });

    test("true if there are point selections (2/2)", () => {
        const pm = new ViewParamRuntime();
        pm.registerParam({ name: "foo", select: { type: "point" } });
        expect(pm.hasPointSelections()).toBe(true);
    });
});
