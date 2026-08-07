import { expect, test, vi } from "vitest";
import CompositeViewRenderingContext from "./compositeViewRenderingContext.js";
import ViewRenderingContext from "./viewRenderingContext.js";

test("forwards sample-facet batch scopes to every context", () => {
    const first = new ViewRenderingContext({ picking: false });
    const second = new ViewRenderingContext({ picking: false });
    const beginFirst = vi.spyOn(first, "beginSampleFacetBatch");
    const beginSecond = vi.spyOn(second, "beginSampleFacetBatch");
    const endFirst = vi.spyOn(first, "endSampleFacetBatch");
    const endSecond = vi.spyOn(second, "endSampleFacetBatch");
    const composite = new CompositeViewRenderingContext(first, second);

    composite.beginSampleFacetBatch();
    composite.endSampleFacetBatch();

    expect(beginFirst).toHaveBeenCalledOnce();
    expect(beginSecond).toHaveBeenCalledOnce();
    expect(endFirst).toHaveBeenCalledOnce();
    expect(endSecond).toHaveBeenCalledOnce();
});
