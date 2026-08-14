import { expect, test } from "vitest";
import {
    getTopLevelSpecView,
    ViewFactory,
    VIEW_ROOT_NAME,
} from "./viewFactory.js";
import { createTestViewContext } from "./testUtils.js";
import UnitView from "./unitView.js";
import ConcatView from "./concatView.js";

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

test("ImportSpec.zindex overrides imported view zindex", async () => {
    const context = createTestViewContext({
        allowImport: true,
        wrapRoot: false,
    });

    /** @type {import("../spec/view.js").VConcatSpec} */
    const spec = {
        templates: {
            panel: {
                mark: "point",
                zindex: 5,
            },
        },
        vconcat: [
            {
                import: { template: "panel" },
                zindex: 0,
            },
        ],
    };

    const root = /** @type {import("./containerView.js").default} */ (
        await context.createOrImportView(spec, null, null, "root")
    );

    expect([...root][0].getZindex()).toBe(0);
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

test("throws if theme is used in a non-root subtree", async () => {
    const context = createTestViewContext({
        allowImport: true,
        wrapRoot: false,
    });

    await expect(() =>
        context.createOrImportView(
            {
                vconcat: [
                    {
                        mark: "rect",
                        // @ts-expect-error Theme is root-only.
                        theme: "vegalite",
                    },
                ],
            },
            null,
            null,
            "root"
        )
    ).rejects.toThrow('"theme" is only supported at the root specification');
});

test("wraps a registered custom root in an implicit grid", async () => {
    const factory = new ViewFactory();
    factory.addViewType(
        (spec) => "customRoot" in spec,
        (spec, context, layoutParent, dataParent, defaultName, options) =>
            new UnitView(
                { ...spec, mark: "point" },
                context,
                layoutParent,
                dataParent,
                defaultName,
                options
            )
    );

    const context = createTestViewContext();
    context.createOrImportView = (
        spec,
        layoutParent,
        dataParent,
        defaultName,
        validator,
        options
    ) =>
        factory.createOrImportView(
            spec,
            context,
            layoutParent,
            dataParent,
            defaultName,
            validator,
            options
        );

    const root = await context.createOrImportView(
        // @ts-expect-error Custom view specs are registered at runtime.
        { customRoot: true },
        null,
        null,
        VIEW_ROOT_NAME
    );

    const implicitRoot = /** @type {ConcatView} */ (root);
    expect(root).toBeInstanceOf(ConcatView);
    expect(root.name).toBe("implicitRoot");
    expect(getTopLevelSpecView(root)).toBe(implicitRoot.children[0]);
    expect(getTopLevelSpecView(root)).toBeInstanceOf(UnitView);
});

test("does not wrap an authored concat root", async () => {
    const context = createTestViewContext({ wrapRoot: true });
    const root = await context.createOrImportView(
        { vconcat: [] },
        null,
        null,
        VIEW_ROOT_NAME
    );

    expect(root).toBeInstanceOf(ConcatView);
    expect(root.name).toBe(VIEW_ROOT_NAME);
    expect(getTopLevelSpecView(root)).toBe(root);
});
