import { createNormalizedScale } from "../../scales/legendGradientMapping.js";
import { IntervalSelectionController } from "../gridView/intervalSelectionController.js";
import Rectangle from "../layout/rectangle.js";
import { format as numberFormat } from "d3-format";
import { isExprRef } from "../../paramRuntime/paramUtils.js";

/** @param {import("./legendBinding.js").LegendBinding} binding */
export function gradientBrushLayers(binding) {
    const select =
        /** @type {import("../../spec/parameter.js").IntervalSelectionConfig} */ (
            binding.select
        );
    const mark = { ...select.mark };
    delete mark.zindex;
    delete mark.measure;
    for (const [key, value] of Object.entries(mark)) {
        if (isExprRef(value))
            Object.assign(mark, { [key]: { expr: "legendBrushStyle_" + key } });
    }
    return {
        name: "gradientBrush",
        data: { values: [{}] },
        transform: [{ type: "filter", expr: "legendBrush.active" }],
        mark: {
            type: "rect",
            tooltip: false,
            style: "selection-brush",
            clip: true,
            cursor: mark.cursor ?? {
                expr: "legendCreating ? legendBrushCursor : intervalDragActive ? 'grabbing' : 'move'",
            },
            ...mark,
        },
    };
}

/** Attach one ramp host to the shared interval controller, keeping values logical.
 * @param {import("../legendView.js").default} legend
 * @param {import("./legendBinding.js").LegendBinding} binding
 * @param {import("../unitView.js").default[]} units
 * @param {string} [format]
 */
export function bindGradientLegend(legend, binding, units, format) {
    const { name, runtime, component } = binding;
    const select =
        /** @type {import("../../spec/parameter.js").IntervalSelectionConfig} */ (
            binding.select
        );
    const ramp = units.find((unit) => unit.name === "gradientRamp");
    const resolution = legend.getScaleResolution(component);
    const horizontal = legend.legendProps.direction === "horizontal";
    for (const [key, value] of Object.entries(select.mark ?? {})) {
        if (isExprRef(value))
            legend.paramRuntime.registerScopedExpression(
                "legendBrushStyle_" + key,
                value.expr,
                runtime
            );
    }
    const getDomain = () => {
        const domain = resolution.getDomain().map(Number);
        return /** @type {[number, number]} */ ([
            Math.min(domain[0], domain.at(-1)),
            Math.max(domain[0], domain.at(-1)),
        ]);
    };
    const getScale = () => {
        const domain = resolution.getDomain().map(Number);
        if (
            domain.length < 2 ||
            !domain.every(Number.isFinite) ||
            domain.some(
                (v, i) =>
                    i && (v - domain[i - 1]) * (domain[1] - domain[0]) <= 0
            )
        )
            throw new Error(
                `Gradient binding "${name}" requires a strictly monotonic finite domain.`
            );
        const scale = createNormalizedScale(
            resolution.getScale(),
            domain[0],
            domain.at(-1),
            true
        );
        if (![0, 0.5, 1].every((p) => Number.isFinite(scale.invert(p))))
            throw new Error(
                `Gradient binding "${name}" requires an invertible numeric mapping.`
            );
        return scale;
    };
    legend.paramRuntime.registerParam({
        name: "intervalDragActive",
        value: false,
    });
    legend.paramRuntime.registerParam({ name: "legendCreating", value: false });
    legend.paramRuntime.registerParam({
        name: "legendBrushCursor",
        value: horizontal ? "text" : "vertical-text",
    });
    const formatBound = numberFormat(format ?? ".3~g");
    legend.paramRuntime.registerComputed(
        "legendBrush",
        () => [runtime.getParamRef(name), resolution.getMappingRef()],
        () => {
            const bounds = runtime.findValue(name).intervals[component];
            const scale = getScale();
            const [min, max] = getDomain();
            const visible = (/** @type {number} */ value) =>
                Math.max(min, Math.min(max, value));
            const a = bounds ? scale(visible(bounds[0])) : 0;
            const b = bounds ? scale(visible(bounds[1])) : 0;
            return {
                active:
                    !!bounds &&
                    bounds[0] < bounds[1] &&
                    bounds[0] < max &&
                    bounds[1] > min,
                start: Math.min(a, b),
                end: Math.max(a, b),
                label: bounds
                    ? bounds[1] === Infinity
                        ? ">= " + formatBound(bounds[0])
                        : formatBound(bounds[0]) +
                          " to <" +
                          formatBound(bounds[1])
                    : "All scores",
            };
        }
    );
    const coords = () => {
        const collector = ramp.getCollector();
        if (!collector?.completed || !ramp.coords) return undefined;
        const rows = Array.from(collector.getData());
        if (!rows.length) return undefined;
        const enc = ramp.mark.encoders;
        const points = [rows[0], rows.at(-1)].flatMap((row) => [
            ramp.coords.denormalizePoint(
                Number(enc.x(row)),
                Number(enc.y(row)),
                true
            ),
            ramp.coords.denormalizePoint(
                Number(enc.x2(row)),
                Number(enc.y2(row)),
                true
            ),
        ]);
        const xs = points.map((p) => p.x),
            ys = points.map((p) => p.y);
        return Rectangle.create(
            Math.min(...xs),
            Math.min(...ys),
            Math.max(...xs) - Math.min(...xs),
            Math.max(...ys) - Math.min(...ys)
        );
    };
    const controller = new IntervalSelectionController(
        {
            view: legend,
            layoutParent: legend,
            context: legend.context,
            getInteractionCoords: coords,
            getProjectionCoords: () => coords(),
            ramp: {
                horizontal,
                getDomain,
                getScale,
                setDragActive: (active, creating) => {
                    legend.paramRuntime.setValue("intervalDragActive", active);
                    legend.paramRuntime.setValue("legendCreating", creating);
                },
            },
        },
        name,
        runtime.paramConfigs.get(name),
        select,
        runtime,
        false
    );
    legend.registerDisposer(() => controller.dispose());
}
