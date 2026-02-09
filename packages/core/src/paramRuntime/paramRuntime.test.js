import { describe, expect, test } from "vitest";
import ParamRuntime from "./paramRuntime.js";

describe("ParamRuntime", () => {
    test("registers and resolves derived expressions", async () => {
        const runtime = new ParamRuntime();
        const rootScope = runtime.createScope();
        const childScope = runtime.createScope(rootScope);

        const foo = runtime.registerBase(rootScope, "foo", 2);
        const bar = runtime.registerDerived(childScope, "bar", "foo + 3");

        expect(bar.get()).toBe(5);

        foo.set(10);
        await runtime.whenPropagated();

        expect(bar.get()).toBe(13);
    });

    test("derived params are read-only", () => {
        const runtime = new ParamRuntime();
        const scope = runtime.createScope();

        runtime.registerBase(scope, "foo", 1);
        const bar = runtime.registerDerived(scope, "bar", "foo + 1");

        expect("set" in bar).toBe(false);
    });

    test("fails fast on unknown globals", () => {
        const runtime = new ParamRuntime();
        const scope = runtime.createScope();

        expect(() =>
            runtime.registerDerived(scope, "bar", "missing + 1")
        ).toThrow('Unknown variable "missing"');
    });

    test("creates expression refs bound to scope", () => {
        const runtime = new ParamRuntime();
        const root = runtime.createScope();
        const child = runtime.createScope(root);

        runtime.registerBase(root, "foo", 2);
        runtime.registerBase(child, "foo", 10);

        const rootExpr = runtime.createExpression(root, "foo + 1");
        const childExpr = runtime.createExpression(child, "foo + 1");

        expect(rootExpr()).toBe(3);
        expect(childExpr()).toBe(11);
        expect(rootExpr.identifier()).not.toBe(childExpr.identifier());
    });

    test("disposeScope tears down owned nodes and clears local params", async () => {
        const runtime = new ParamRuntime();
        const root = runtime.createScope();
        const child = runtime.createScope(root);

        const foo = runtime.registerBase(root, "foo", 1);
        const bar = runtime.registerDerived(child, "bar", "foo + 1");

        expect(bar.get()).toBe(2);
        expect(runtime.resolve(child, "bar")).toBe(bar);

        runtime.disposeScope(child);
        expect(runtime.resolve(child, "bar")).toBeUndefined();

        foo.set(5);
        await runtime.whenPropagated();

        // Non-obvious: disposed computeds keep their last value and no longer track updates.
        expect(bar.get()).toBe(2);
    });
});
