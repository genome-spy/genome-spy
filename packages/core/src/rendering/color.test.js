import { expect, test } from "vitest";
import { cssColorToRgba } from "./color.js";
import { toGpuColor } from "./webgpu/webGpuColor.js";

test.each([
    "transparent",
    "rgba(255, 0, 0, 0)",
    "#12345600",
    "hsla(120, 50%, 50%, 0)",
])("prepares finite invisible paint for %s", (color) => {
    expect(cssColorToRgba(color)).toEqual([0, 0, 0, 0]);
    expect(toGpuColor(color)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
});

test("preserves opaque and translucent color components", () => {
    expect(cssColorToRgba("#336699")).toEqual([0.2, 0.4, 0.6, 1]);
    expect(cssColorToRgba("rgba(255, 0, 0, 0.5)")).toEqual([1, 0, 0, 0.5]);
    expect(cssColorToRgba("#ff000080")).toEqual([1, 0, 0, 128 / 255]);
    expect(() => cssColorToRgba("invalid")).toThrow("Invalid color");
});
