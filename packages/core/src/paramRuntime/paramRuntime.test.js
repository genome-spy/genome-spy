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

        expect(() => runtime.registerDerived(scope, "bar", "missing + 1")).toThrow(
            'Unknown variable "missing"'
        );
    });
});
