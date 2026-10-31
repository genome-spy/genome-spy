import {
    resolveRuleProperties,
    visitRuleInstances,
} from "../../immediate/marks/rule.js";
import {
    encodeNumber,
    getDrawConstantPaint,
    resolveMarkProperty,
    toPaintString,
} from "../../immediate/markEncoding.js";

/** @type {WeakMap<CanvasRenderingContext2D, CanvasRenderingContext2D>} */
const outlineLayers = new WeakMap();

/**
 * @param {import("../../../marks/mark.js").default} baseMark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderRuleCanvas(baseMark, options) {
    const mark = /** @type {import("../../../marks/rule.js").default} */ (
        baseMark
    );
    const context = options.context;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    context.lineCap = resolveMarkProperty(mark, mark.properties.strokeCap);
    context.setLineDash(
        resolveMarkProperty(mark, mark.properties.strokeDash) ?? []
    );
    context.lineDashOffset = resolveMarkProperty(
        mark,
        mark.properties.strokeDashOffset
    );
    const constantStroke = getDrawConstantPaint(encoders.color, options);
    const properties = resolveRuleProperties(mark);
    return visitRuleInstances(mark, properties, options, (instance) => {
        const stroke =
            constantStroke ?? toPaintString(encoders.color(instance.datum));
        const opacity =
            encodeNumber(encoders.opacity, instance.datum) *
            options.viewOpacity;
        if (stroke == "none" || opacity <= 0 || instance.strokeWidth <= 0) {
            return;
        }
        context.globalAlpha = opacity;
        if (properties.outlineWidth > 0 && opacity < 1) {
            // Composite each translucent rule once, including its antialiased caps.
            drawTranslucentRule(context, instance, properties, stroke, options);
        } else {
            drawRule(context, instance, properties, stroke);
        }
    });
}

/** Draws one rule's outline and interior in datum order. */
function drawRule(
    /** @type {CanvasRenderingContext2D} */ context,
    /** @type {import("../../immediate/marks/rule.js").RuleInstance} */ instance,
    /** @type {ReturnType<typeof resolveRuleProperties>} */ properties,
    /** @type {string} */ stroke
) {
    context.beginPath();
    context.moveTo(instance.x1, instance.y1);
    context.lineTo(instance.x2, instance.y2);
    if (properties.outlineWidth > 0) {
        context.strokeStyle = properties.outlineColor;
        context.lineWidth = instance.outerWidth;
        context.stroke();
    }
    if (context.strokeStyle != stroke) context.strokeStyle = stroke;
    context.lineWidth = instance.strokeWidth;
    context.stroke();
}

/** Reuses a bounded scratch surface to apply opacity after both paints. */
function drawTranslucentRule(
    /** @type {CanvasRenderingContext2D} */ context,
    /** @type {import("../../immediate/marks/rule.js").RuleInstance} */ instance,
    /** @type {ReturnType<typeof resolveRuleProperties>} */ properties,
    /** @type {string} */ stroke,
    /** @type {import("./index.js").CanvasMarkRenderingOptions} */ options
) {
    let layer = outlineLayers.get(context);
    if (!layer) {
        layer = document.createElement("canvas").getContext("2d");
        outlineLayers.set(context, layer);
    }
    const { x1, y1, x2, y2, outerWidth } = instance;
    const bounds = options.visibleBounds;
    const dpr = options.devicePixelRatio;
    const x = Math.floor(
        Math.max(bounds.x1 - 1, Math.min(x1, x2) - outerWidth) * dpr
    );
    const y = Math.floor(
        Math.max(bounds.y1 - 1, Math.min(y1, y2) - outerWidth) * dpr
    );
    const width =
        Math.ceil(
            Math.min(bounds.x2 + 1, Math.max(x1, x2) + outerWidth) * dpr
        ) - x;
    const height =
        Math.ceil(
            Math.min(bounds.y2 + 1, Math.max(y1, y2) + outerWidth) * dpr
        ) - y;
    const canvas = layer.canvas;
    if (canvas.width < width) canvas.width = width;
    if (canvas.height < height) canvas.height = height;
    layer.resetTransform();
    layer.clearRect(0, 0, width, height);
    layer.setTransform(dpr, 0, 0, dpr, -x, -y);
    layer.lineCap = context.lineCap;
    layer.setLineDash(context.getLineDash());
    layer.lineDashOffset = context.lineDashOffset;
    drawRule(layer, instance, properties, stroke);
    context.drawImage(
        canvas,
        0,
        0,
        width,
        height,
        x / dpr,
        y / dpr,
        width / dpr,
        height / dpr
    );
}
