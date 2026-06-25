import { expect, test } from "vitest";
import { ViewFactory, VIEW_ROOT_NAME } from "./viewFactory.js";
import { createTestViewContext } from "./testUtils.js";
import ConcatView from "./concatView.js";
import FacetView from "./facetView.js";

test("factory recognizes facet specs", () => {
    const factory = new ViewFactory();

    expect(
        factory.isViewSpec({
            facet: { field: "Series" },
            spec: { mark: "point" },
        })
    ).toBeTruthy();
});

test("root facet spec is wrapped in an implicit grid root", async () => {
    const context = createTestViewContext({ wrapRoot: true });
    const view = await context.createOrImportView(
        {
            facet: { field: "Series" },
            spec: {
                data: { values: [] },
                mark: "point",
            },
        },
        null,
        null,
        VIEW_ROOT_NAME
    );

    expect(view).toBeInstanceOf(ConcatView);
    expect(view.name).toBe("implicitRoot");
    expect(view.children).toHaveLength(1);
    expect(view.children[0]).toBeInstanceOf(FacetView);
});
