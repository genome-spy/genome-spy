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

test("shorthand facet groups by the column field", async () => {
    const context = createTestViewContext();
    const view = /** @type {FacetView} */ (
        await context.createOrImportView(
            {
                facet: { field: "Series" },
                spec: { mark: "point" },
            },
            null,
            null,
            "facet"
        )
    );

    expect(view.getFacetFields()).toEqual(["Series"]);
});

test("row and column facets group by row then column fields", async () => {
    const context = createTestViewContext();
    const view = /** @type {FacetView} */ (
        await context.createOrImportView(
            {
                facet: {
                    row: { field: "Origin" },
                    column: { field: "Cylinders" },
                },
                spec: { mark: "point" },
            },
            null,
            null,
            "facet"
        )
    );

    expect(view.getFacetFields()).toEqual(["Origin", "Cylinders"]);
});

test("row facet cannot be combined with wrapping columns", async () => {
    const context = createTestViewContext();

    await expect(() =>
        context.createOrImportView(
            {
                facet: {
                    row: { field: "Origin" },
                    column: { field: "Cylinders" },
                },
                columns: 2,
                spec: { mark: "point" },
            },
            null,
            null,
            "facet"
        )
    ).rejects.toThrow(
        'Facet "columns" can be used only with one-dimensional column facets.'
    );
});
