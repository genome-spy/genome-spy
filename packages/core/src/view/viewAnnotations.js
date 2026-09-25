import { isExprRef } from "../paramRuntime/paramUtils.js";
import UnitView from "./unitView.js";
import { assessViewQuery } from "./viewSliceQuery.js";
import { getReadyCollector } from "./viewDataApi.js";
import { annotationPlacements } from "./viewAnnotationAccess.js";
import {
    createAnnotationOverlay,
    createAnnotationPlacement,
} from "./pointAnnotationOverlay.js";
/** @typedef {import("../data/sources/inlineSource.js").default} InlineSource */

/** @typedef {import('../types/viewQueryApi.js').ViewAnnotationSet} AnnotationSet */
/** @typedef {{view: UnitView, collector: import('../data/collector.js').default, revision: number, datum: import('../data/flowNode.js').Datum}} Target */

/**
 * Source positions are evaluated by the same point geometry used by rendering.
 * The first contract excludes conditional/displaced/faceted positions rather
 * than assigning an ambiguous anchor to them.
 * @param {import('./view.js').default} view
 * @returns {import('../types/viewQueryApi.js').ViewAnnotationAssessment}
 */
export function assessAnnotations(view) {
    if (!(view instanceof UnitView) || view.getMarkType() !== "point") {
        return {
            status: "unsupported",
            reason: "Annotations require a point mark.",
        };
    }
    const support = assessViewQuery(view, { channels: ["x", "y"] });
    if (support.status !== "ready") return support;

    const encoding = view.getEncoding();
    const properties = typeof view.spec.mark === "object" ? view.spec.mark : {};
    for (const channel of /** @type {const} */ (["x", "y"])) {
        const definition = encoding[channel];
        if (!definition || "condition" in definition || "expr" in definition) {
            return {
                status: "unsupported",
                reason: "Annotations require unconditional positions.",
            };
        }
    }
    for (const channel of ["x2", "y2", "dx", "dy", "xOffset", "yOffset"]) {
        if (channel in encoding || channel in properties) {
            return {
                status: "unsupported",
                reason: "Displaced and ranged positions are not supported.",
            };
        }
    }
    for (const channel of [
        "size",
        "shape",
        "angle",
        "strokeWidth",
        "semanticScore",
    ]) {
        const definition = /** @type {Record<string, any>} */ (encoding)[
            channel
        ];
        const property = /** @type {Record<string, any>} */ (
            view.mark.properties
        )[channel];
        if (hasDynamicValue(definition) || hasDynamicValue(property)) {
            return {
                status: "unsupported",
                reason: "Parameter-dependent point geometry is not supported.",
            };
        }
    }
    if (Object.values(view.mark.properties).some(hasDynamicValue)) {
        return {
            status: "unsupported",
            reason: "Parameter-dependent mark properties are not supported.",
        };
    }
    return { status: "ready" };
}

/** @param {unknown} value */
function hasDynamicValue(value) {
    if (!value || typeof value !== "object") return false;
    const definition = /** @type {Record<string, unknown>} */ (value);
    return (
        isExprRef(value) ||
        "condition" in definition ||
        isExprRef(definition.value) ||
        isExprRef(definition.datum)
    );
}

/** Owns bounded temporary references and one applied annotation set. */
export default class ViewAnnotations {
    /** @type {Map<string, Target>} */
    #references = new Map();

    /** @type {Map<UnitView, import('./layerView.js').default>} */
    #overlays = new Map();

    /** @type {Map<UnitView, Promise<import('./layerView.js').default>>} */
    #pendingOverlays = new Map();

    /** @type {{target: Target, text: string}[]} */
    #active = [];

    #generation = 0;
    #disposed = false;
    #invalidated = false;
    #unsubscribe = () => {};

    /** @type {(address: import('../types/embedApi.js').ViewAddress) => import('./view.js').default} */
    #resolve;

    /** @param {(address: import('../types/embedApi.js').ViewAddress) => import('./view.js').default} resolve */
    constructor(resolve) {
        this.#resolve = resolve;
        resolve("root").registerDisposer(() => this.dispose());
    }

    /** @param {UnitView} view @param {import('../data/flowNode.js').Datum[]} rows */
    capture(view, rows) {
        this.#assertLive();
        const assessment = assessAnnotations(view);
        if (assessment.status !== "ready") throw new Error(assessment.reason);
        const collector = getReadyCollector(view);
        const references = new Map();
        const result = rows.map((datum) => {
            if (!datum)
                throw new Error("Analysis lost its source association.");
            const reference = crypto.randomUUID();
            references.set(reference, {
                view,
                collector,
                revision: collector.dataRevision,
                datum,
            });
            return reference;
        });
        this.#references = references;
        return result;
    }

    /** @param {AnnotationSet} set @param {{signal?: AbortSignal}} [options] */
    async replace(set, { signal } = {}) {
        this.#assertLive();
        signal?.throwIfAborted();
        set = structuredClone(set);
        if (
            !set ||
            !Array.isArray(set.targets) ||
            set.targets.length > 1000 ||
            (set.emphasis !== undefined &&
                !["purple", "orange", "blue"].includes(set.emphasis)) ||
            (set.connectors !== undefined &&
                typeof set.connectors !== "boolean")
        ) {
            throw new Error("Invalid annotation targets or presentation.");
        }
        const active = set.targets.map(({ reference, text = "" }) => {
            if (typeof text !== "string" || text.length > 500)
                throw new Error(
                    "Annotation labels must be text of at most 500 characters."
                );
            const target = this.#references.get(reference);
            if (!target)
                throw new Error("Unknown or expired annotation reference.");
            this.#assertCurrent(target);
            return { target, text };
        });
        if (new Set(active.map(({ target }) => target.view)).size > 1)
            throw new Error("An annotation set must belong to one view.");
        if (
            new Set(active.map(({ target }) => target.datum)).size !==
            active.length
        ) {
            throw new Error("Annotation targets must be unique.");
        }
        const hasText = active.some(({ text }) => text.trim().length > 0);
        if (
            active.length &&
            ((!set.emphasis && !hasText) || (set.connectors && !hasText))
        ) {
            throw new Error(
                "Annotations need text or emphasis; connectors need text."
            );
        }
        const generation = ++this.#generation;
        const view = active[0]?.target.view;
        const overlay = view ? await this.#getOverlay(view) : undefined;
        this.#assertLive();
        signal?.throwIfAborted();
        if (generation !== this.#generation)
            throw new Error("Annotation replacement was superseded.");
        active.forEach(({ target }) => this.#assertCurrent(target));

        this.#empty();
        this.#active = active;
        this.#invalidated = false;
        if (view) {
            const collector = active[0].target.collector;
            const unobserve = collector.observe(() => {
                this.#empty();
                this.#invalidated = true;
            });
            const scales = [
                view.getScaleResolution("x"),
                view.getScaleResolution("y"),
            ];
            const reflow = () => view.context.requestLayoutReflow();
            scales.forEach((scale) => scale.addEventListener("domain", reflow));
            this.#unsubscribe = () => {
                unobserve();
                scales.forEach((scale) =>
                    scale.removeEventListener("domain", reflow)
                );
            };
            const arrange = createAnnotationPlacement(
                view,
                overlay,
                active,
                set
            );
            annotationPlacements.set(view, (context, coords, options) => {
                if (collector.dataRevision !== active[0].target.revision) {
                    this.#empty();
                    this.#invalidated = true;
                    return;
                }
                arrange(context, coords, options);
            });
        }
        await this.#render();
    }

    clear() {
        this.#assertLive();
        this.#generation++;
        this.#empty();
        this.#invalidated = false;
        return this.#render();
    }

    inspect() {
        this.#assertLive();
        return {
            activeTargets: this.#active.length,
            sourceRevision: this.#active[0]?.target.revision ?? null,
            invalidated: this.#invalidated,
        };
    }

    get disposed() {
        return this.#disposed;
    }

    dispose() {
        if (this.#disposed) return;
        this.#generation++;
        this.#empty();
        this.#references.clear();
        for (const overlay of this.#overlays.values()) overlay.disposeSubtree();
        this.#overlays.clear();
        this.#disposed = true;
    }

    // Synchronous API synchronization keeps layout/render failures in the
    // operation's promise. It submits commands without claiming browser paint.
    async #render() {
        const context = this.#resolve("root").context;
        context.computeLayout();
        context.renderImmediately();
    }

    #empty() {
        this.#unsubscribe();
        this.#unsubscribe = () => {};
        const view = this.#active[0]?.target.view;
        if (view) {
            annotationPlacements.delete(view);
            view.context.requestLayoutReflow();
            const overlay = this.#overlays.get(view);
            if (overlay)
                /** @type {InlineSource} */ (
                    overlay.flowHandle.dataSource
                ).updateDynamicData([]);
        }
        this.#active = [];
    }

    #assertLive() {
        if (this.#disposed)
            throw new Error("Annotation controller was disposed.");
        this.#resolve("root");
    }

    /** @param {Target} target */
    #assertCurrent(target) {
        if (
            target.view.getCollector() !== target.collector ||
            target.collector.dataRevision !== target.revision ||
            assessAnnotations(target.view).status !== "ready"
        ) {
            throw new Error(
                "Annotation reference was invalidated by a data or view change."
            );
        }
    }

    /** @param {UnitView} view */
    async #getOverlay(view) {
        const existing = this.#overlays.get(view);
        if (existing) return existing;
        const pending = this.#pendingOverlays.get(view);
        if (pending) return pending;
        const promise = this.#createOverlay(view).finally(() =>
            this.#pendingOverlays.delete(view)
        );
        this.#pendingOverlays.set(view, promise);
        return promise;
    }

    /** @param {UnitView} view */
    async #createOverlay(view) {
        const overlay = await createAnnotationOverlay(view);
        try {
            this.#assertLive();
            this.#overlays.set(view, overlay);
            view.registerDisposer(() => {
                if (this.#active.some(({ target }) => target.view === view)) {
                    this.#empty();
                    this.#invalidated = true;
                }
                if (this.#overlays.delete(view)) overlay.disposeSubtree();
            });
            return overlay;
        } catch (error) {
            overlay.disposeSubtree();
            throw error;
        }
    }
}
