import { expect, onTestFinished, test, vi } from "vitest";
import ViewParamRuntime from "./viewParamRuntime.js";

/** @param {ViewParamRuntime} [parent] */
function createRuntime(parent) {
    const runtime = new ViewParamRuntime(parent ? () => parent : undefined);
    onTestFinished(() => runtime.dispose());
    return runtime;
}

test("an unclaimed bare parameter remains an ordinary writable push target", () => {
    const owner = createRuntime();
    const setter = owner.registerParam({ name: "order" });
    owner.finalizeOutputDeclarations();

    expect(owner.getValue("order")).toBeNull();
    expect(owner.isWritable("order")).toBe(true);

    const child = createRuntime(owner);
    const push = child.registerParam({ name: "order", push: "outer" });
    push(["A"]);
    expect(owner.getValue("order")).toEqual(["A"]);

    setter(["B"]);
    expect(child.findValue("order")).toEqual(["B"]);
    expect(Array.from(owner.outputs)).toEqual([]);
});

test("claiming a bare slot preserves bound refs and makes ordinary setters read-only", () => {
    const owner = createRuntime();
    const setter = owner.registerParam({
        name: "order",
        description: "Published order",
    });
    const ref = owner.getParamRef("order");

    // The parent expression exists before the child can establish output ownership.
    owner.registerParam({
        name: "count",
        expr: "order ? length(order) : -1",
    });
    const observe = vi.fn(() => owner.getValue("count"));
    owner.subscribe("count", observe);
    expect(owner.getValue("count")).toBe(-1);

    const producer = createRuntime(owner);
    const output = producer.resolveOutput({ name: "order", push: "outer" });

    expect(owner.getParamRef("order")).toBe(ref);
    expect(producer.getParamRef("order")).toBe(ref);
    expect(owner.getOutput("order")).toBe(output);
    expect(owner.getValue("order")).toEqual([]);
    expect(owner.getValue("count")).toBe(0);
    expect(observe).toHaveReturnedWith(0);
    expect(owner.isWritable("order")).toBe(false);
    expect(owner.paramConfigs.get("order")).toMatchObject({
        description: "Published order",
        persist: false,
    });
    expect(() => setter(["A"])).toThrow(/output parameter "order"/i);
    expect(() => owner.setValue("order", ["A"])).toThrow(/writable parameter/i);
    expect(owner.getValue("order")).toEqual([]);
});

/** @type {[string, import("../spec/parameter.js").Parameter][]} */
const pushedWriters = [
    ["variable", { name: "order", push: "outer" }],
    ["selection", { name: "order", push: "outer", select: "point" }],
    ["ruler", { name: "order", push: "outer", ruler: { encodings: ["x"] } }],
];

test.each(pushedWriters)(
    "output ownership conflicts with pushed %s writers in either declaration order",
    (_kind, declaration) => {
        for (const outputFirst of [false, true]) {
            const owner = createRuntime();
            owner.registerParam({ name: "order" });
            const writer = createRuntime(owner);
            const producer = createRuntime(owner);
            const claim = () =>
                producer.resolveOutput({ name: "order", push: "outer" });

            if (outputFirst) {
                claim();
                expect(() => writer.registerParam(declaration)).toThrow(
                    /outer parameter "order"/i
                );
                expect(owner.getValue("order")).toEqual([]);
            } else {
                writer.registerParam(declaration);
                const previous = owner.getValue("order");
                expect(claim).toThrow(/bare parameter with no other writers/i);
                expect(owner.isWritable("order")).toBe(true);
                expect(owner.getValue("order")).toBe(previous);
            }
        }
    }
);

test("disposing a pushed writer releases its claim on the ancestor slot", () => {
    const owner = createRuntime();
    owner.registerParam({ name: "order" });
    const writer = createRuntime(owner);
    writer.registerParam({ name: "order", push: "outer", select: "point" });
    writer.dispose();

    const producer = createRuntime(owner);
    const output = producer.resolveOutput({ name: "order", push: "outer" });
    expect(owner.getOutput("order")).toBe(output);
    expect(owner.getValue("order")).toEqual([]);
});

test("output pushing uses the nearest ancestor without skipping incompatible shadows", () => {
    const outer = createRuntime();
    outer.registerParam({ name: "order" });
    const shadow = createRuntime(outer);
    shadow.registerParam({ name: "order", value: ["shadow"] });
    const child = createRuntime(shadow);
    const claimShadow = () =>
        child.resolveOutput({ name: "order", push: "outer" });

    expect(claimShadow).toThrow(/bare parameter/i);
    expect(outer.isWritable("order")).toBe(true);

    const outerProducer = createRuntime(outer);
    const outerOutput = outerProducer.resolveOutput({
        name: "order",
        push: "outer",
    });
    expect(claimShadow).toThrow(/bare parameter/i);
    expect(shadow.getValue("order")).toEqual(["shadow"]);

    const nearer = createRuntime(outer);
    nearer.registerParam({ name: "order" });
    const nearerProducer = createRuntime(nearer);
    const nearerOutput = nearerProducer.resolveOutput({
        name: "order",
        push: "outer",
    });
    expect(nearer.getOutput("order")).toBe(nearerOutput);
    expect(nearerOutput).not.toBe(outerOutput);
});

test("configured owners reject new output ownership while preserving the ordinary slot", () => {
    const owner = createRuntime();
    owner.registerParam({ name: "order" });
    owner.finalizeOutputDeclarations();
    const producer = createRuntime(owner);

    expect(() =>
        producer.resolveOutput({ name: "order", push: "outer" })
    ).toThrow(/configured ancestor parameter "order"/i);
    expect(owner.getValue("order")).toBeNull();
    expect(owner.isWritable("order")).toBe(true);
    expect(Array.from(owner.outputs)).toEqual([]);
});
