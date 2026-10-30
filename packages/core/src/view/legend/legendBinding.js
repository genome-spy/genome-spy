import { isDiscrete } from "vega-scale";
import {
    asSelectionConfig,
    clearPointSelection,
} from "../../selection/selection.js";
import { updateCategorySelection } from "../../selection/categorySelection.js";
import { createEventPredicate } from "../../utils/interactionConfig.js";
import { isExprRef } from "../../paramRuntime/paramUtils.js";
import { isInChromeSubtree } from "../viewChrome.js";

/**
 * @typedef {object} LegendBinding
 * @prop {string} name
 * @prop {import("../../paramRuntime/viewParamRuntime.js").default} runtime
 * @prop {import("../../spec/parameter.js").CategorySelectionChannel} component
 * @prop {import("../../spec/parameter.js").PointSelectionConfig} select
 */

/** Resolve explicit sources before constructing generated guides.
 * @param {import("../view.js").default[]} views
 */
export function resolveLegendBindings(views) {
    const authored = views.filter((view) => !isInChromeSubtree(view));
    const resolutions = new Set(
        authored.flatMap((view) => Object.values(view.resolutions.legend))
    );
    for (const resolution of resolutions) resolution.selectionBindings.clear();
    const legends = Array.from(resolutions).flatMap((resolution) =>
        resolution
            .getLegendDefs()
            .map((definition) => ({ resolution, definition }))
    );

    for (const view of authored) {
        for (const param of view.paramRuntime.paramConfigs.values()) {
            if (
                !("bind" in param) ||
                param.bind !== "legend" ||
                !("select" in param)
            )
                continue;
            const select = asSelectionConfig(param.select);
            if (select.type !== "point" || !select.encodings) {
                throw new Error(
                    `Legend binding "${param.name}" requires one categorical point projection.`
                );
            }
            const component = select.encodings[0];
            const scale = view.getScaleResolution(component);
            const matches = legends.filter(({ definition }) => {
                const represents =
                    definition.channel === component ||
                    component in (definition.symbolChannels ?? {});
                return (
                    represents &&
                    definition.view.getScaleResolution(component) === scale
                );
            });
            if (
                !scale ||
                !["nominal", "ordinal"].includes(scale.type) ||
                !isDiscrete(scale.getResolvedScaleType()) ||
                !matches.length
            ) {
                throw new Error(
                    `Legend binding "${param.name}" requires an unambiguous categorical symbol legend in its declaring scope.`
                );
            }
            const binding = {
                name: param.name,
                runtime: view.paramRuntime,
                component,
                select,
            };
            const ref = binding.runtime.getParamRef(binding.name);
            for (const { resolution, definition } of matches) {
                if (definition.type !== "symbol")
                    throw new Error(
                        `Legend binding "${param.name}" requires a symbol legend.`
                    );
                const previous = resolution.selectionBindings.get(
                    definition.scaleResolution
                );
                if (
                    previous &&
                    previous.runtime.getParamRef(previous.name) !== ref
                ) {
                    throw new Error(
                        `A legend cannot bind competing selections "${previous.name}" and "${param.name}".`
                    );
                }
                resolution.selectionBindings.set(
                    definition.scaleResolution,
                    binding
                );
            }
        }
    }
}

/** Connect generated guide inputs to the existing selection and encoders.
 * @param {import("../legendView.js").default} legend
 * @param {LegendBinding} binding
 * @param {import("../unitView.js").default[]} units
 */
export function bindLegend(legend, binding, units) {
    const { name, runtime, component, select } = binding;
    const alias = "legendSelection";
    legend.paramRuntime.registerScopedExpression(alias, name, runtime);
    const entry = units.find((unit) => unit.name === "entries");
    entry.mark.pickingGeometry = true;
    for (const unit of units) {
        if (!["symbols", "labels"].includes(unit.name)) continue;
        const label = unit.name === "labels";
        const input = label ? "legendCategory" : component;
        if (label) {
            unit.mark.nonvisualInputs.set(input, {
                field: "value",
                type: "nominal",
                resolutionChannel: component,
                domainInert: true,
            });
        }
        const encoding = /** @type {Record<string, any>} */ (
            unit.mark.encoding
        );
        for (const channel of label
            ? ["opacity"]
            : ["fillOpacity", "strokeOpacity"]) {
            const base = encoding[channel] ?? { value: 1 };
            const value = base.value;
            encoding[channel] = {
                ...base,
                condition: {
                    param: alias,
                    project: { [component]: input },
                    value,
                },
                value: isExprRef(value)
                    ? { expr: `(${value.expr}) * 0.35` }
                    : value * 0.35,
            };
        }
    }

    /** @param {import("../../utils/interaction.js").default} event */
    const picked = (event) => {
        let datum;
        if (event.markHit !== undefined) {
            if (event.markHit?.mark !== entry.mark) return;
            datum = event.markHit.datum;
        } else {
            // Custom clear events such as mousedown have no renderer pick.
            // Hit-test the same entry geometry instead of reusing stale hover.
            const collector = entry.getCollector();
            if (!collector?.completed) return;
            const x = (event.point.x - entry.coords.x) / entry.coords.width;
            const y =
                1 - (event.point.y - entry.coords.y) / entry.coords.height;
            const e = entry.mark.encoders;
            for (const row of collector.getData()) {
                const x1 = /** @type {number} */ (e.x(row));
                const x2 = /** @type {number} */ (e.x2(row));
                const y1 = /** @type {number} */ (e.y(row));
                const y2 = /** @type {number} */ (e.y2(row));
                if (
                    x >= Math.min(x1, x2) &&
                    x <= Math.max(x1, x2) &&
                    y >= Math.min(y1, y2) &&
                    y <= Math.max(y1, y2)
                ) {
                    datum = row;
                    break;
                }
            }
            if (!datum) return;
        }
        event.stopPropagation();
        return datum;
    };
    legend.addInteractionListener("click", (event) => {
        const datum = picked(event);
        if (!datum) return;
        runtime.setValue(
            name,
            updateCategorySelection(
                runtime.findValue(name),
                datum.value,
                !!select.toggle && event.mouseEvent.shiftKey
            )
        );
    });
    if (select.clear) {
        const clear =
            /** @type {import("../../spec/parameter.js").EventConfig} */ (
                select.clear
            );
        const matches = createEventPredicate(clear);
        legend.addInteractionListener(clear.type, (event) => {
            if (picked(event) && matches(event.proxiedMouseEvent)) {
                runtime.setValue(name, clearPointSelection(select));
            }
        });
    }
}
