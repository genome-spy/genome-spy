import UnitView from "./unitView.js";
import { createGeneratedChromeOverlay } from "./gridView/generatedChromeOverlay.js";
import {
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../data/flowInit.js";
import { finalizeViewConfiguration } from "../genomeSpy/viewHierarchyConfig.js";
/** @typedef {import("../data/sources/inlineSource.js").default} InlineSource */
import {
    visitPointInstances,
    resolvePointProperties,
} from "../rendering/immediate/marks/point.js";
import {
    createClipOptions,
    combineClipOptions,
} from "./renderingContext/clipOptions.js";

/**
 * Reuse Core point geometry, then feed normalized positions into ordinary
 * decorative marks. Cached records keep annotation updates out of source data.
 * @param {import('./unitView.js').default} view
 * @param {import('./layerView.js').default} overlay
 * @param {{target: {datum: import('../data/flowNode.js').Datum}, text: string}[]} active
 * @param {import('../types/viewQueryApi.js').ViewAnnotationSet} set
 * @returns {(context: import('./renderingContext/viewRenderingContext.js').default, coords: import('./layout/rectangle.js').default, options: import('../types/rendering.js').RenderingOptions) => void}
 */
export function createAnnotationPlacement(view, overlay, active, set) {
    const color =
        { purple: "#7c3aed", orange: "#d97706", blue: "#2563eb" }[
            set.emphasis
        ] ?? "#333333";
    overlay.paramRuntime.setValue("annotationColor", color);
    const sourceRows = active.map(({ target }) => target.datum);
    const records = new Map(
        active.map(({ target, text }) => [
            target.datum,
            {
                x: NaN,
                y: NaN,
                size: NaN,
                text,
                halo: set.emphasis ? 1 : 0,
                connector: set.connectors && text ? 1 : 0,
            },
        ])
    );
    /** @type {import("../data/flowNode.js").Datum[]} */
    const data = [];
    return (context, coords, options) => {
        let count = 0;
        let changed = false;
        const bounds = {
            x1: coords.x,
            y1: coords.y,
            x2: coords.x + coords.width,
            y2: coords.y + coords.height,
        };
        visitPointInstances(
            /** @type {import('../marks/point.js').default} */ (view.mark),
            resolvePointProperties(
                /** @type {import('../marks/point.js').default} */ (view.mark)
            ),
            {
                coords,
                data: sourceRows,
                visibleBounds: bounds,
                anchorCullBounds: bounds,
            },
            (point) => {
                const record = records.get(point.datum);
                const x = (point.x - coords.x) / coords.width;
                const y = 1 - (point.y - coords.y) / coords.height;
                const size = (point.boundsRadius * 2 + 8) ** 2;
                changed ||=
                    record.x !== x ||
                    record.y !== y ||
                    record.size !== size ||
                    data[count] !== record;
                record.x = x;
                record.y = y;
                record.size = size;
                data[count++] = record;
            }
        );
        changed ||= data.length !== count;
        data.length = count;
        // Republish only changed geometry, not every animation frame.
        if (changed) {
            const source = /** @type {InlineSource} */ (
                overlay.flowHandle.dataSource
            );
            source.updateDynamicData(data);
        }
        const clip = combineClipOptions(
            options.clip,
            createClipOptions(coords, true, true)
        );
        overlay.arrange(context, coords, {
            ...options,
            clip,
            clipRect: clip.rect,
        });
    };
}

/** @param {import('./unitView.js').default} view */
export async function createAnnotationOverlay(view) {
    const { view: overlay } = createGeneratedChromeOverlay({
        spec: annotationSpec(),
        context: view.context,
        layoutParent: view.layoutParent,
        dataParent: undefined,
        name: "queryAnnotations",
    });
    try {
        await overlay.initializeChildren();
        overlay.visit((child) => {
            if (child instanceof UnitView) child.resolve();
        });
        initializeViewSubtree(overlay, view.context.dataFlow);
        finalizeViewConfiguration(overlay);
        await loadViewSubtreeData(overlay);

        // A chart without existing text may load its first font for labels.
        await view.context.textMetrics.waitUntilReady();
        return overlay;
    } catch (error) {
        overlay.disposeSubtree();
        throw error;
    }
}

/** Ordinary decorative marks, with already evaluated normalized coordinates.
 * @returns {import('../spec/view.js').LayerSpec}
 */
function annotationSpec() {
    return {
        domainInert: true,
        params: [{ name: "annotationColor", value: "#333333" }],
        data: { values: [] },
        encoding: {
            x: { field: "x", type: "quantitative", scale: null },
            y: { field: "y", type: "quantitative", scale: null },
            color: { value: { expr: "annotationColor" } },
        },
        layer: [
            {
                mark: {
                    type: "point",
                    filled: false,
                    strokeWidth: 2,
                    tooltip: null,
                    clip: true,
                },
                encoding: {
                    size: { field: "size", type: "quantitative", scale: null },
                    opacity: {
                        field: "halo",
                        type: "quantitative",
                        scale: null,
                    },
                },
            },
            {
                mark: {
                    type: "rule",
                    tooltip: null,
                    clip: true,
                    x2Offset: 12,
                    y2Offset: -18,
                },
                encoding: {
                    x2: { field: "x", type: "quantitative", scale: null },
                    y2: { field: "y", type: "quantitative", scale: null },
                    opacity: {
                        field: "connector",
                        type: "quantitative",
                        scale: null,
                    },
                },
            },
            {
                mark: {
                    type: "text",
                    tooltip: null,
                    clip: true,
                    align: "left",
                    baseline: "bottom",
                    xOffset: 14,
                    yOffset: -18,
                    size: 12,
                },
                encoding: { text: { field: "text" } },
            },
        ],
    };
}
