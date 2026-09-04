import { expect, test, vi } from "vitest";
import ViewParamRuntime from "./viewParamRuntime.js";

test("scoped expressions bind lazily in the source and belong to the destination", async () => {
    const source = new ViewParamRuntime();
    const child = new ViewParamRuntime(() => source);
    const overlay = new ViewParamRuntime(() => child);
    child.registerParam({ name: "color", value: "blue" });
    overlay.registerScopedExpression("style", "color", source);
    // Declarations can precede initialization of their source dependencies.
    source.registerParam({ name: "color", value: "red" });
    expect(overlay.isPendingParam("style")).toBe(true);
    expect(overlay.findValue("style")).toBe("red");
    expect(() => overlay.setValue("style", "green")).toThrow(
        "Writable parameter"
    );
    const read = overlay.createExpression("style");
    const changed = vi.fn();
    overlay.subscribe("style", changed);
    source.setValue("color", "green");
    await source.whenPropagated();
    expect(read()).toBe("green");
    expect(changed).toHaveBeenCalledOnce();
    child.setValue("color", "yellow");
    await source.whenPropagated();
    expect(changed).toHaveBeenCalledOnce();
    overlay.dispose();
    source.setValue("color", "black");
    await source.whenPropagated();
    expect(changed).toHaveBeenCalledOnce();
    expect(read()).toBe("green");
    expect(source.findValue("color")).toBe("black");
});

test("scoped expressions reject unrelated runtimes and duplicate names", () => {
    const source = new ViewParamRuntime();
    const overlay = new ViewParamRuntime(() => source);
    expect(() =>
        overlay.registerScopedExpression("style", "1", new ViewParamRuntime())
    ).toThrow("share a parameter runtime");
    overlay.registerScopedExpression("style", "1", source);
    expect(() =>
        overlay.registerScopedExpression("style", "2", source)
    ).toThrow("already registered");
});
