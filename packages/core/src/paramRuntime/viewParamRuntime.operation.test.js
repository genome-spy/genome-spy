import { describe, expect, test, vi } from "vitest";
import ViewParamRuntime from "./viewParamRuntime.js";
import createScale from "../scale/scale.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";

describe("grouped configuration operations", () => {
    test("rebinds a stable output and reranks already queued downstream work", () => {
        const runtime = new ViewParamRuntime();
        const input = runtime.signal("input", 1);
        const first = runtime.computed("first", [input], () => input.get() * 2);
        const second = runtime.computed(
            "second",
            [first],
            () => first.get() * 3
        );
        const apply = vi.fn();
        const output = runtime.operation(
            "mapping",
            [input],
            () => input.get(),
            apply
        );
        const read = vi.fn(() => [input.get(), output.get()]);
        const consumer = runtime.computed("consumer", [input, output], read);
        apply.mockClear();
        read.mockClear();

        runtime.runInTransaction(() => {
            input.set(2);
            output.rebind([second], () => second.get());
        });
        runtime.flushNow();

        expect(apply).toHaveBeenCalledExactlyOnceWith(12);
        expect(read).toHaveBeenCalledTimes(1);
        expect(consumer.get()).toEqual([2, 12]);

        output.rebind([input], () => input.get());
        runtime.flushNow();
        input.set(3);
        runtime.flushNow();
        expect(consumer.get()).toEqual([3, 3]);
        runtime.dispose();
    });

    test("rejects indirect replacement cycles before disconnecting valid inputs", () => {
        const runtime = new ViewParamRuntime();
        const input = runtime.signal("input", 1);
        const output = runtime.operation(
            "mapping",
            [input],
            () => input.get(),
            () => {}
        );
        const dependent = runtime.computed(
            "dependent",
            [output],
            () => output.get() * 2
        );

        expect(() => output.rebind([dependent], () => dependent.get())).toThrow(
            /dependency cycle: mapping/
        );
        input.set(2);
        runtime.flushNow();
        expect(output.get()).toBe(2);
        expect(dependent.get()).toBe(4);
        output.dispose();
        expect(() => output.rebind([input], () => input.get())).toThrow(
            /disposed operation/
        );
        runtime.dispose();
    });

    test("synchronously applies resolution-scoped expressions with a separate owner", () => {
        const resolution = new ViewParamRuntime();
        const owner = new ViewParamRuntime(() => resolution);
        const width = resolution.signal("width input", 10);
        // Exercise the same-turn propagation path used by scale inputs.
        width.propagation = "sync";
        const setHeight = resolution.registerParam({
            name: "height",
            value: 10,
        });
        owner.registerParam({ name: "height", value: 99 });
        const height = resolution.createExpression("height");
        let applied = 0;
        const area = owner.operation(
            "area",
            [width, ...height.dependencies],
            () => width.get() * height(),
            (value) => {
                applied = value;
            }
        );
        const observe = vi.fn(() => applied);
        owner.effect([area], observe);

        width.set(20);
        expect(applied).toBe(200);
        expect(observe).toHaveReturnedWith(200);
        observe.mockClear();

        resolution.runInTransaction(() => {
            width.set(30);
            setHeight(20);
            resolution.flushNow({ afterTransaction: true });
        });

        expect(applied).toBe(600);
        expect(observe).toHaveBeenCalledTimes(1);
        expect(observe).toHaveReturnedWith(600);
        owner.dispose();
        resolution.dispose();
    });

    test("applies a settled band mapping before mixed-input consumers evaluate", () => {
        const runtime = new ViewParamRuntime();
        const width = runtime.signal("width", 100);
        const padding = runtime.signal("padding", 0);
        const inner = runtime.computed("inner", [padding], () => padding.get());
        const outer = runtime.computed(
            "outer",
            [padding],
            () => padding.get() / 2
        );
        const scale = createScale({ type: "band", domain: ["a", "b"] });
        const apply = vi.fn((/** @type {number[]} */ values) => {
            scale.range([0, values[0]]);
            scale.paddingInner(values[1]);
            scale.paddingOuter(values[2]);
        });
        const mapping = runtime.operation(
            "band mapping",
            [width, inner, outer],
            () => [width.get(), inner.get(), outer.get()],
            apply,
            { equals: shallowArrayEquals }
        );
        // The direct width edge must not let this run before the longer padding
        // branches and the mapping operation have updated the physical scale.
        const read = vi.fn(() => [width.get(), scale("b"), scale.bandwidth()]);
        const geometry = runtime.computed("geometry", [width, mapping], read);
        expect(apply).toHaveBeenCalledTimes(1);
        apply.mockClear();
        read.mockClear();

        runtime.runInTransaction(() => {
            width.set(200);
            runtime.runInTransaction(() => padding.set(0.2));
        });
        runtime.flushNow();

        expect(apply).toHaveBeenCalledExactlyOnceWith([200, 0.2, 0.1]);
        expect(read).toHaveBeenCalledTimes(1);
        expect(geometry.get()).toEqual([200, 110, 80]);
        runtime.dispose();
    });

    test("suppresses application and publication for equal configurations", () => {
        const runtime = new ViewParamRuntime();
        const input = runtime.signal("input", 1);
        const apply = vi.fn();
        const mapping = runtime.operation(
            "rounded range",
            [input],
            () => [0, Math.floor(input.get())],
            apply,
            { equals: shallowArrayEquals }
        );
        const observe = vi.fn();
        runtime.effect([mapping], observe);

        input.set(1.5);
        runtime.flushNow();

        expect(mapping.get()).toEqual([0, 1]);
        expect(apply).toHaveBeenCalledTimes(1);
        expect(observe).not.toHaveBeenCalled();
        runtime.dispose();
    });

    test("validates before applying and rejects the propagation barrier", async () => {
        const runtime = new ViewParamRuntime();
        const width = runtime.signal("width", 10);
        let applied = 0;
        const mapping = runtime.operation(
            "validated width",
            [width],
            () => {
                if (width.get() < 0) throw new Error("Invalid width");
                return width.get();
            },
            (value) => {
                applied = value;
            }
        );
        const observe = vi.fn();
        runtime.effect([mapping], observe);

        width.set(-1);
        const propagated = runtime.whenPropagated();
        expect(() => runtime.flushNow()).toThrow("Invalid width");
        await expect(propagated).rejects.toThrow("Invalid width");
        expect(applied).toBe(10);
        expect(mapping.get()).toBe(10);
        expect(observe).not.toHaveBeenCalled();

        width.set(20);
        runtime.flushNow();
        expect(applied).toBe(20);
        expect(observe).toHaveBeenCalledTimes(1);
        runtime.dispose();
    });

    test("does not publish a failed application and permits explicit retry", async () => {
        const runtime = new ViewParamRuntime();
        const width = runtime.signal("width", 10);
        let fail = false;
        const apply = vi.fn(() => {
            if (fail) throw new Error("Application failed");
        });
        const mapping = runtime.operation(
            "mapping",
            [width],
            () => width.get(),
            apply
        );
        const observe = vi.fn();
        runtime.effect([mapping], observe);

        fail = true;
        width.set(20);
        const propagated = runtime.whenPropagated();
        expect(() => runtime.flushNow()).toThrow("Application failed");
        await expect(propagated).rejects.toThrow("Application failed");
        expect(mapping.get()).toBe(10);
        expect(observe).not.toHaveBeenCalled();

        fail = false;
        runtime.flushNow();
        expect(mapping.get()).toBe(20);
        expect(observe).toHaveBeenCalledTimes(1);
        runtime.dispose();
    });

    test.each(["binding", "owner"])(
        "%s disposal cancels pending application without disposing its inputs",
        (disposal) => {
            const parent = new ViewParamRuntime();
            const owner = new ViewParamRuntime(() => parent);
            const input = parent.signal("input", 1);
            const apply = vi.fn();
            const mapping = owner.operation(
                "mapping",
                [input],
                () => input.get(),
                apply
            );

            input.set(2);
            if (disposal === "binding") mapping.dispose();
            else owner.dispose();
            parent.flushNow();
            input.set(3);
            parent.flushNow();

            expect(apply).toHaveBeenCalledTimes(1);
            expect(mapping.get()).toBe(1);
            expect(input.get()).toBe(3);
            owner.dispose();
            parent.dispose();
        }
    );
});
