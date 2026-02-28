import { expect, test } from "vitest";
import { ViewFactory } from "./viewFactory.js";
import { createTestViewContext } from "./testUtils.js";

test("isViewSpec", () => {
    const factory = new ViewFactory();

    // @ts-ignore
    expect(factory.isViewSpec({})).toBeFalsy();

    expect(factory.isViewSpec({ mark: "rect" })).toBeTruthy();
    expect(factory.isViewSpec({ layer: [] })).toBeTruthy();
    expect(
        factory.isViewSpec({ multiscale: [{ mark: "point" }], stops: [] })
    ).toBeTruthy();
    expect(factory.isViewSpec({ hconcat: [] })).toBeTruthy();
    expect(factory.isViewSpec({ vconcat: [] })).toBeTruthy();
    expect(factory.isViewSpec({ concat: [], columns: 1 })).toBeTruthy();

    expect(() => factory.isViewSpec({ mark: "rect", layer: [] })).toThrow();
    expect(() =>
        factory.isViewSpec({
            mark: "rect",
            multiscale: [{ mark: "point" }],
            stops: [],
        })
    ).toThrow();
});

test("Throws if importing is not allowed", async () => {
    const factory = new ViewFactory({ allowImport: false });

    await expect(() =>
        factory.createOrImportView({ import: { url: "" } }, undefined)
    ).rejects.toThrow();
});

test("ImportSpec.visible overrides imported view visibility", async () => {
    const context = createTestViewContext({
        allowImport: true,
        wrapRoot: false,
    });

    /** @type {import("../spec/view.js").VConcatSpec} */
    const spec = {
        templates: {
            panel: {
                name: "panel",
                mark: "point",
                visible: true,
            },
        },
        vconcat: [
            {
                import: { template: "panel" },
                name: "panelHidden",
                visible: false,
            },
            {
                import: { template: "panel" },
                name: "panelVisible",
            },
        ],
    };

    const root = /** @type {import("./containerView.js").default} */ (
        await context.createOrImportView(spec, null, null, "root")
    );
    const hidden = root.findDescendantByName("panelHidden");
    const visible = root.findDescendantByName("panelVisible");

    expect(hidden.spec.visible).toBe(false);
    expect(visible.spec.visible).toBe(true);
});

test("ImportSpec.config is merged before imported root config", async () => {
    const context = createTestViewContext({
        allowImport: true,
        wrapRoot: false,
    });

    /** @type {import("../spec/view.js").VConcatSpec} */
    const spec = {
        config: {
            mark: { color: "green" },
        },
        templates: {
            panel: {
                mark: "point",
                config: {
                    mark: { color: "red" },
                    point: { size: 42 },
                },
            },
        },
        vconcat: [
            {
                import: { template: "panel" },
                config: {
                    mark: { color: "blue" },
                    point: { opacity: 0.4 },
                },
            },
        ],
    };

    const root = /** @type {import("./containerView.js").default} */ (
        await context.createOrImportView(spec, null, null, "root")
    );
    const imported = [...root][0];

    expect(imported.spec.config.mark.color).toBe("red");
    expect(imported.spec.config.point.opacity).toBe(0.4);
    expect(imported.spec.config.point.size).toBe(42);
    expect(imported.getConfig().mark.color).toBe("red");
});
