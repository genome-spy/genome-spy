// @vitest-environment jsdom

import { expect, test, vi } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../../config/defaultConfig.js";
import { resolveBaseConfig } from "../../config/resolveConfig.js";
import {
    DEFAULT_THEME_NAME,
    resolveThemeSelection,
} from "../../config/themes.js";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../../rendering/svg/index.js";
import Interaction from "../../utils/interaction.js";
import Point from "../layout/point.js";

/**
 * Child parameters deliberately shadow the declaration's styling parameters.
 * @param {import("../../spec/parameter.js").RulerExtent} extent
 * @param {import("../../spec/parameter.js").RulerDisplay} display
 * @param {{ source?: "pointer" | "viewport", push?: boolean, disabled?: boolean | import("../../spec/parameter.js").ExprRef }} [options]
 */
async function createRulerView(extent, display, options = {}) {
    /** @type {import("../../spec/view.js").VConcatSpec} */
    const spec = {
        name: "owner",
        params: [
            { name: "showRuler", value: true },
            { name: "highlight", value: false },
            { name: "rulerDisabled", value: false },
            {
                name: "cursor",
                ...(options.push ? { push: "outer" } : {}),
                value: { x: 25 },
                ruler: {
                    source: options.source ?? "pointer",
                    disabled: options.disabled,
                    extent,
                    display,
                    mark: {
                        opacity: { expr: "showRuler ? 0.8 : 0" },
                        stroke: { expr: "highlight ? 'red' : 'black'" },
                        strokeWidth: { expr: "highlight ? 3 : 1" },
                        fill: { expr: "highlight ? 'yellow' : 'blue'" },
                        fillOpacity: { expr: "highlight ? 0.5 : 0.25" },
                        shadowOpacity: { expr: "highlight ? 0.4 : 0" },
                        shadowBlur: { expr: "highlight ? 4 : 0" },
                    },
                },
            },
        ],
        data: { values: [{ x: 10 }, { x: 40 }] },
        encoding: {
            x: {
                field: "x",
                type: "index",
                scale: { domain: [0, 100], zoom: true },
                axis: null,
            },
        },
        resolve: { scale: { x: "shared" } },
        vconcat: ["first", "second"].map((name) => ({
            name,
            width: 200,
            height: 60,
            params: [
                { name: "showRuler", value: false },
                { name: "highlight", value: true },
                { name: "rulerDisabled", value: true },
            ],
            mark: "point",
        })),
    };
    const { view } = await createHeadlessEngine(
        options.push
            ? {
                  params: [
                      { name: "cursor", value: null },
                      { name: "showRuler", value: false },
                  ],
                  vconcat: [spec],
              }
            : spec,
        {
            contextOptions: {
                viewFactoryOptions: { wrapRoot: true },
                baseConfig: resolveBaseConfig({
                    defaultConfig: INTERNAL_DEFAULT_CONFIG,
                    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
                }),
            },
        }
    );
    const owner = view.getDescendants().find((child) => child.name === "owner");
    return { view, owner };
}

/** @param {import("../view.js").default} view */
function exportRulers(view) {
    const { svg, warnings } = createSvg({
        viewRoot: view,
        logicalWidth: 240,
        logicalHeight: 160,
        background: null,
    });
    expect(warnings).toEqual([]);
    return Array.from(
        svg.querySelectorAll('[data-name^="rulerOverlay"] [data-mark-type]')
    );
}

for (const extent of /** @type {const} */ (["view", "container"])) {
    test.each(/** @type {const} */ (["line", "band"]))(
        extent +
            " %s styling updates in declaration scope without changing coordinates or data",
        async (display) => {
            const { view, owner } = await createRulerView(extent, display);
            try {
                const originalCoordinate =
                    owner.paramRuntime.findValue("cursor");
                const scale = owner.getScaleResolution("x");
                const originalDomain = scale.getDomain();
                const guides = exportRulers(view);
                expect(guides).toHaveLength(extent === "view" ? 2 : 1);
                for (const guide of guides) {
                    expect(guide.getAttribute("stroke")).toBe("black");
                    expect(guide.getAttribute("stroke-width")).toBe("1");
                    expect(guide.getAttribute("stroke-opacity")).toBe("0.8");
                    if (display === "band") {
                        expect(guide.getAttribute("fill")).toBe("blue");
                        expect(guide.getAttribute("fill-opacity")).toBe("0.2");
                    }
                }
                const requestRender = vi.spyOn(
                    view.context.animator,
                    "requestRender"
                );
                owner.paramRuntime.setValue("highlight", true);
                await owner.paramRuntime.whenPropagated();
                for (const guide of exportRulers(view)) {
                    expect(guide.getAttribute("stroke")).toBe("red");
                    expect(guide.getAttribute("stroke-width")).toBe("3");
                    if (display === "band") {
                        expect(guide.getAttribute("fill")).toBe("yellow");
                        expect(guide.getAttribute("fill-opacity")).toBe("0.4");
                        expect(guide.querySelector("[filter]")).not.toBeNull();
                    }
                }
                owner.paramRuntime.setValue("showRuler", false);
                await owner.paramRuntime.whenPropagated();
                expect(requestRender).toHaveBeenCalled();
                expect(exportRulers(view)).toHaveLength(0);
                expect(owner.paramRuntime.findValue("cursor")).toBe(
                    originalCoordinate
                );
                expect(scale.getDomain()).toEqual(originalDomain);
                owner.paramRuntime.setValue("showRuler", true);
                await owner.paramRuntime.whenPropagated();
                expect(exportRulers(view)).toHaveLength(guides.length);
            } finally {
                view.disposeSubtree();
            }
        }
    );
}

test("pushed rulers use the declaration scope rather than the coordinate storage scope", async () => {
    const { view, owner } = await createRulerView("view", "line", {
        push: true,
    });
    try {
        // The nested concat and its two plots each participate in view extent.
        expect(exportRulers(view)).toHaveLength(3);
        owner.paramRuntime.setValue("showRuler", false);
        await owner.paramRuntime.whenPropagated();
        expect(exportRulers(view)).toHaveLength(0);
        expect(owner.paramRuntime.findValue("cursor").values.x).toBe(25);
    } finally {
        view.disposeSubtree();
    }
});

test("hidden pointer rulers continue tracking and clearing", async () => {
    const { view, owner } = await createRulerView("container", "line");
    try {
        exportRulers(view);
        owner.paramRuntime.setValue("showRuler", false);
        const plot = view
            .getDescendants()
            .find((child) => child.name === "first");
        const point = new Point(
            plot.coords.x + plot.coords.width / 2,
            plot.coords.y + 20
        );
        plot.propagateInteraction(
            new Interaction(point, new MouseEvent("mousemove"))
        );
        expect(owner.paramRuntime.findValue("cursor").values.x).toBe(50);
        plot.propagateInteraction(
            new Interaction(point, new MouseEvent("mouseleave"))
        );
        expect(owner.paramRuntime.findValue("cursor").values.x).toBeNull();
        owner.paramRuntime.setValue("showRuler", true);
        await owner.paramRuntime.whenPropagated();
        expect(exportRulers(view)).toHaveLength(0);
    } finally {
        view.disposeSubtree();
    }
});

test("hidden viewport rulers follow zoom and reveal the current center", async () => {
    const { view, owner } = await createRulerView("container", "band", {
        source: "viewport",
    });
    try {
        exportRulers(view);
        owner.paramRuntime.setValue("showRuler", false);
        const scale = owner.getScaleResolution("x");
        await scale.zoomTo([60, 80]);
        const zoomedDomain = scale.getDomain();
        await owner.paramRuntime.whenPropagated();
        expect(owner.paramRuntime.findValue("cursor").values.x).toBe(70);
        expect(exportRulers(view)).toHaveLength(0);
        owner.paramRuntime.setValue("showRuler", true);
        await owner.paramRuntime.whenPropagated();
        expect(exportRulers(view)).toHaveLength(1);
        expect(scale.getDomain()).toEqual(zoomedDomain);
    } finally {
        view.disposeSubtree();
    }
});

test("disabled pointer rulers clear once, ignore events, and resume at the next coordinate", async () => {
    const { view, owner } = await createRulerView("container", "line", {
        disabled: { expr: "rulerDisabled" },
    });
    try {
        expect(exportRulers(view)).toHaveLength(1);
        const plot = view
            .getDescendants()
            .find((child) => child.name === "first");
        const point = new Point(
            plot.coords.x + plot.coords.width / 2,
            plot.coords.y + 20
        );
        owner.paramRuntime.setValue("rulerDisabled", true);
        await owner.paramRuntime.whenPropagated();
        const cleared = owner.paramRuntime.findValue("cursor");
        expect(cleared.values.x).toBeNull();
        expect(exportRulers(view)).toHaveLength(0);
        const requestRender = vi.spyOn(view.context.animator, "requestRender");
        for (const type of ["mousemove", "mousemove", "mouseleave"]) {
            plot.propagateInteraction(
                new Interaction(point, new MouseEvent(type))
            );
        }
        await owner.paramRuntime.whenPropagated();
        expect(owner.paramRuntime.findValue("cursor")).toBe(cleared);
        expect(requestRender).not.toHaveBeenCalled();
        owner.paramRuntime.setValue("rulerDisabled", false);
        expect(owner.paramRuntime.findValue("cursor")).toBe(cleared);
        plot.propagateInteraction(
            new Interaction(point, new MouseEvent("mousemove"))
        );
        await owner.paramRuntime.whenPropagated();
        expect(owner.paramRuntime.findValue("cursor").values.x).toBe(50);
        expect(exportRulers(view)).toHaveLength(1);
    } finally {
        view.disposeSubtree();
    }
});

test("disabled viewport rulers clear and resume only on a later viewport event", async () => {
    const { view, owner } = await createRulerView("container", "band", {
        source: "viewport",
        disabled: { expr: "rulerDisabled" },
    });
    try {
        exportRulers(view);
        const scale = owner.getScaleResolution("x");
        owner.paramRuntime.setValue("rulerDisabled", true);
        await scale.zoomTo([60, 80]);
        expect(owner.paramRuntime.findValue("cursor").values.x).toBeNull();
        owner.paramRuntime.setValue("rulerDisabled", false);
        expect(owner.paramRuntime.findValue("cursor").values.x).toBeNull();
        await scale.zoomTo([20, 40]);
        expect(owner.paramRuntime.findValue("cursor").values.x).toBe(30);
    } finally {
        view.disposeSubtree();
    }
});

test.each(/** @type {const} */ (["pointer", "viewport"]))(
    "initially disabled %s rulers discard their initial coordinate",
    async (source) => {
        const { view, owner } = await createRulerView("container", "line", {
            source,
            disabled: true,
        });
        try {
            expect(owner.paramRuntime.findValue("cursor").values.x).toBeNull();
            expect(exportRulers(view)).toHaveLength(0);
        } finally {
            view.disposeSubtree();
        }
    }
);
