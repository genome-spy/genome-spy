import { expect, test, vi } from "vitest";
import PlacementSource from "./placementSource.js";

test("publishes atomic topology and geometry revisions", () => {
    const source = new PlacementSource();
    source.replaceTopology([["a"]], new Float32Array([-0.1, -0.2, 1, 0.5]));
    const first = source.getSnapshot();

    source.replaceGeometry(new Float32Array([-0.1, 0.25, 1, 0.5]));
    const second = source.getSnapshot();

    expect(second.topology).toBe(first.topology);
    expect(second.topology.revision).toBe(1);
    expect(second.geometryRevision).toBe(2);
    expect(second.rectangles).toEqual(new Float32Array([-0.1, 0.25, 1, 0.5]));
});

test("rejects invalid sizes and non-finite coordinates", () => {
    const source = new PlacementSource();

    expect(() =>
        source.replaceTopology([["a"]], new Float32Array([0, 0, -1, 1]))
    ).toThrow("non-negative sizes");
    expect(() =>
        source.replaceTopology([["a"]], new Float32Array([NaN, 0, 1, 1]))
    ).toThrow("finite coordinates");
});

test("notifies backend owners exactly once on disposal", () => {
    const source = new PlacementSource();
    const dispose = vi.fn();
    source.onDispose(dispose);

    source.dispose();
    source.dispose();

    expect(dispose).toHaveBeenCalledOnce();
    expect(() => source.getSnapshot()).toThrow("disposed");
});
