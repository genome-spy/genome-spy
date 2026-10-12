import {
    createPendingRegionSelection,
    createRegionSelection,
    iterateRegionSelectionForView,
    materializeRegionSelectionForView,
} from "../../selection/regionSelection.js";
import { primaryPositionalChannels } from "../../encoder/encoder.js";
import { getViewSelector } from "../viewSelectors.js";
import {
    isRegionSelectionFiltered,
    isRegionProducerReady,
} from "../../selection/regionSelectionProducer.js";
import { hasNonCollinearVertices } from "../../selection/polygon.js";
import {
    getRegionProjection,
    captureRegionScale,
} from "../../selection/regionProjection.js";
import { startDocumentDrag } from "../../utils/documentDrag.js";
import { isDataReady } from "../../data/dataReadiness.js";
import Rectangle from "../layout/rectangle.js";
import { ViewInteractionListenerTracker } from "../viewInteractionListenerTracker.js";
import { createEventPredicate } from "../../utils/interactionConfig.js";
import { iterateRegionSelectionMembership } from "../../selection/regionSelectionMembership.js";

/** Binds native lasso state and captures gestures; the host supplies rendering. */
export class RegionSelectionController {
    /**
     * Binds one native selection to its producer lifecycle and transient preview.
     * @param {import("../unitView.js").default} view
     * @param {string} name
     * @param {import("../../spec/parameter.js").RegionSelectionConfig} select
     * @param {import("../../paramRuntime/viewParamRuntime.js").default} runtime
     */
    static bindSelection(view, name, select, runtime) {
        const valueRuntime = runtime.findRuntimeForParam(name);
        /** @type {ReturnType<import("../../genomeSpy/regionSelectionOverlay.js").createRegionSelectionOverlay> | undefined} */
        let overlay;

        /** @type {import("../../types/viewContext.js").RegionSelectionMaterializer | undefined} */
        let materializer;
        let initialized = false;
        view.registerDisposer(() => overlay?.dispose());
        view.registerDisposer(
            view._addBroadcastHandler("subtreeDataReady", () => {
                if (initialized) return;
                const collector = view.getCollector();
                if (!collector || !isDataReady(collector)) return;
                const selectionRef = runtime.getParamRef(name);
                if (isRegionSelectionFiltered(view, selectionRef)) {
                    if (runtime === view.paramRuntime)
                        throw new Error(
                            "A region producer cannot be filtered by its own selection."
                        );
                    initialized = true;
                    return;
                }
                const producer = JSON.stringify(getViewSelector(view));
                const zoomable = primaryPositionalChannels.some((channel) =>
                    view.getScaleResolution(channel)?.isZoomable()
                );
                /** @param {import("../../types/selectionTypes.js").RegionSelection} selection */
                const commit = (selection) => {
                    runtime.setValue(
                        name,
                        materializeRegionSelectionForView(selection, view)
                    );
                    view.context.animator.requestRender();
                };
                const animator = view.context.animator;
                /** @type {Generator<void, import("../../types/selectionTypes.js").RegionSelection, void> | undefined} */
                let confirmation;
                /** @type {object | undefined} */
                let readback;
                const cancelConfirmation = () => {
                    if (!confirmation && !readback) return;
                    confirmation = undefined;
                    readback = undefined;
                    animator.cancelTransition(confirm);
                    document.removeEventListener("keydown", confirmationKey);
                    window.removeEventListener("blur", cancelConfirmation);
                    materializer?.stop();
                    animator.requestRender();
                };
                const confirmationKey = (
                    /** @type {KeyboardEvent} */ event
                ) => {
                    if (event.key === "Escape") cancelConfirmation();
                };
                const confirm = () => {
                    // A cancelled callback may already be in the animator's current frame.
                    if (!confirmation) return;
                    if (!isDataReady(view.getCollector())) {
                        cancelConfirmation();
                        return;
                    }
                    const deadline = performance.now() + 8;
                    try {
                        let result;
                        do {
                            result = confirmation.next();
                            if (result.done) {
                                if (readback) materializer.commit(result.value);
                                runtime.setValue(name, result.value);
                                cancelConfirmation();
                                return;
                            }
                        } while (performance.now() < deadline);
                        animator.requestTransition(confirm);
                    } catch (error) {
                        cancelConfirmation();
                        throw error;
                    }
                };
                view.registerDisposer(cancelConfirmation);
                const controller = new RegionSelectionController(view, {
                    getCoords: () => {
                        if (view.facetCoords.size !== 1)
                            throw new Error(
                                "Region selection requires a single plot placement."
                            );
                        return view.coords;
                    },
                    isEnabled: () => isDataReady(view.getCollector()),
                    on: /** @type {import("../../spec/parameter.js").EventConfig} */ (
                        select.on
                    ) ?? {
                        type: "mousedown",
                        ...(zoomable ? { filter: "event.shiftKey" } : {}),
                    },
                    onStart: () => {
                        cancelConfirmation();
                        const cancel = () => {
                            cancelConfirmation();
                            controller.cancel();
                        };
                        materializer =
                            view.context.createRegionSelectionMaterializer?.(
                                view,
                                name,
                                cancel,
                                select.preview === "density"
                            );
                        if (!materializer && select.preview === "density")
                            throw new Error("Density lasso requires WebGPU.");
                    },
                    isConfirming: () =>
                        confirmation !== undefined || readback !== undefined,
                    onTrace: (points) => {
                        if (!overlay && points.length)
                            overlay =
                                view.context.createRegionSelectionOverlay();
                        overlay?.update(points);
                        if (materializer && points.length) {
                            materializer.update(points);
                            if (select.preview !== "density")
                                animator.requestRender();
                        }
                    },
                    onCancel: () => {
                        materializer?.stop();
                        animator.requestRender();
                    },
                    onCommit: (selection) => {
                        if (materializer) {
                            const stride = Math.max(
                                1,
                                Math.ceil(selection.intent.polygon.length / 511)
                            );
                            const polygon = selection.intent.polygon.filter(
                                (_, i) =>
                                    i % stride === 0 ||
                                    i === selection.intent.polygon.length - 1
                            );
                            // Sampling can collapse an otherwise valid trace onto a line.
                            if (!hasNonCollinearVertices(polygon)) {
                                materializer.stop();
                                animator.requestRender();
                                return;
                            }
                            selection = createPendingRegionSelection({
                                ...selection.intent,
                                polygon,
                            });
                        }
                        document.addEventListener("keydown", confirmationKey);
                        window.addEventListener("blur", cancelConfirmation);
                        // Keep the GPU selection visible while CPU consumers receive its rows.
                        if (materializer) {
                            const { x, y, width, height } = view.coords;
                            materializer.update(
                                selection.intent.polygon.map(([u, v]) => [
                                    x + u * width,
                                    y + (1 - v) * height,
                                ])
                            );
                        }
                        if (materializer) {
                            const rows = view.getCollector().getData();
                            const token = {};
                            readback = token;
                            materializer.readIds().then(
                                (snapshot) => {
                                    if (readback !== token) return;
                                    confirmation =
                                        iterateRegionSelectionMembership(
                                            selection,
                                            rows,
                                            snapshot
                                        );
                                    animator.requestTransition(confirm);
                                },
                                () => {
                                    if (readback === token)
                                        cancelConfirmation();
                                }
                            );
                        } else {
                            confirmation = iterateRegionSelectionForView(
                                selection,
                                view
                            );
                            confirm();
                        }
                    },
                });
                initialized = true;
                const replay = () => {
                    const selection = valueRuntime.getValue(name);
                    if (
                        selection.status === "pending" &&
                        JSON.stringify(selection.intent.producer) ===
                            producer &&
                        isRegionProducerReady(view)
                    ) {
                        commit(selection);
                    }
                };
                const replayRevision = view.paramRuntime.signal(
                    "regionReplayRevision",
                    0
                );
                view.paramRuntime.effect(
                    [selectionRef, replayRevision],
                    replay
                );
                runtime.watchExpression(
                    name,
                    () => {
                        cancelConfirmation();
                        controller.cancel();
                    },
                    {
                        scopeOwned: false,
                        registerDisposer: (dispose) =>
                            view.registerDisposer(dispose),
                    }
                );
                const invalidate = () => {
                    const selection = valueRuntime.getValue(name);
                    if (
                        selection.status !== "cleared" &&
                        JSON.stringify(selection.intent.producer) === producer
                    ) {
                        // Data replacement clears live queries; replay explicitly rebuilds saved intent.
                        runtime.setValue(name, createRegionSelection());
                    }
                };
                if (valueRuntime !== view.paramRuntime)
                    view.registerDisposer(invalidate);
                let dataRevision = collector.dataRevision;
                view.registerDisposer(
                    collector.observe(() => {
                        if (collector.dataRevision === dataRevision) return;
                        dataRevision = collector.dataRevision;
                        cancelConfirmation();
                        controller.cancel();
                        if (valueRuntime.getValue(name).status === "pending")
                            replayRevision.set(dataRevision);
                        else invalidate();
                    })
                );
                replay();
            })
        );
        if (select.clear) {
            const clear =
                /** @type {import("../../spec/parameter.js").EventConfig} */ (
                    select.clear
                );
            const predicate = createEventPredicate(clear);
            const listeners = new ViewInteractionListenerTracker(view);
            listeners.add(clear.type, (event) => {
                if (predicate(event.proxiedMouseEvent)) {
                    runtime.setValue(name, createRegionSelection());
                    view.context.animator.requestRender();
                }
            });
            view.registerDisposer(() => listeners.dispose());
        }
    }

    /**
     * @param {import("../unitView.js").default} view
     * @param {{
     *   getCoords: () => Rectangle,
     *   isEnabled: () => boolean,
     *   isConfirming?: () => boolean,
     *   onTrace: (points: ReadonlyArray<readonly [number, number]>) => void,
     *   onCommit: (selection: import("../../types/selectionTypes.js").RegionSelection) => void,
     *   onStart?: () => void,
     *   onCancel?: () => void,
     *   on?: import("../../spec/parameter.js").EventConfig,
     * }} host
     */
    constructor(view, host) {
        getRegionProjection(view);
        this.view = view;
        this.host = host;
        const on = host.on ?? { type: "mousedown", filter: "event.shiftKey" };
        if (on.type !== "mousedown")
            throw new Error("Region selection starts on mousedown.");
        this.#predicate = createEventPredicate(on);
        this.#listeners = new ViewInteractionListenerTracker(view);
        this.#listeners.add("mousedown", (event) => this.#start(event), true);
        this.#listeners.add(
            "wheel",
            (event) => {
                if (this.#dragging || this.host.isConfirming?.())
                    event.stopPropagation();
            },
            true
        );
        view.registerDisposer(() => this.dispose());
    }

    /** @type {import("../unitView.js").default} */
    view;

    /** @type {ConstructorParameters<typeof RegionSelectionController>[1]} */
    host;

    /** @type {ViewInteractionListenerTracker} */
    #listeners;

    /** @type {(event: MouseEvent) => boolean} */
    #predicate;

    #dragging = false;

    #disposed = false;

    /** @type {() => boolean} */
    #cancelDrag = () => false;

    /** @param {ReadonlyArray<readonly [number, number]>} polygon */
    createSelection(polygon) {
        if (this.#disposed)
            throw new Error("Region selection controller is disposed.");
        return createPendingRegionSelection({
            ...getRegionProjection(this.view),
            polygon,
        });
    }

    cancel() {
        const cancelled = this.#cancelDrag();
        if (cancelled) this.host.onCancel?.();
        return cancelled;
    }

    dispose() {
        this.cancel();
        this.#listeners.dispose();
        this.#disposed = true;
    }

    /** @param {import("../../utils/interaction.js").default} event */
    #start(event) {
        const mouse = event.mouseEvent;
        if (
            event.stopped ||
            mouse.button !== 0 ||
            !this.host.isEnabled() ||
            this.#dragging
        )
            return;

        const selectsRegion = this.#predicate(mouse);
        if (!selectsRegion && !this.host.isConfirming?.()) return;

        const coords = this.host.getCoords();
        if (
            !coords.containsPoint(event.point.x, event.point.y) ||
            coords.width <= 0 ||
            coords.height <= 0
        )
            return;

        if (!selectsRegion) {
            // Navigation cannot reproject a transient image before membership is ready.
            event.stopPropagation();
            mouse.preventDefault();
            return;
        }

        const bounds = Rectangle.create(
            coords.x,
            coords.y,
            coords.width,
            coords.height
        );
        const projection = getRegionProjection(this.view);
        const collector = this.view.getCollector();
        const revision = collector.dataRevision;
        const offsetX = mouse.clientX - event.point.x;
        const offsetY = mouse.clientY - event.point.y;
        /** @type {[number, number][]} */
        const trace = [];

        /** @param {MouseEvent} input */
        const append = (input) => {
            const x = Math.max(
                bounds.x,
                Math.min(bounds.x + bounds.width, input.clientX - offsetX)
            );
            const y = Math.max(
                bounds.y,
                Math.min(bounds.y + bounds.height, input.clientY - offsetY)
            );
            const last = trace.at(-1);
            if (last && Math.hypot(x - last[0], y - last[1]) < 5) return;
            trace.push([x, y]);
            this.host.onTrace(trace);
        };
        const cancel = () => this.cancel();
        const keydown = (/** @type {KeyboardEvent} */ input) => {
            if (input.key === "Escape") cancel();
        };

        this.host.onStart?.();
        event.stopPropagation();
        mouse.preventDefault();
        this.#dragging = true;
        append(mouse);
        document.addEventListener("keydown", keydown);
        window.addEventListener("blur", cancel);
        this.#cancelDrag = startDocumentDrag({
            hoverContext: this.view.context,
            onMove: append,
            onFinish: () => {
                this.#dragging = false;
                document.removeEventListener("keydown", keydown);
                window.removeEventListener("blur", cancel);
                this.host.onTrace([]);
            },
            onRelease: (input) => {
                // A changed scene no longer matches the captured pointer projection.
                const current = this.host.getCoords();
                if (
                    !isDataReady(collector) ||
                    this.view.getCollector() !== collector ||
                    collector.dataRevision !== revision ||
                    /** @type {const} */ (["x", "y", "width", "height"]).some(
                        (key) => current[key] !== bounds[key]
                    ) ||
                    /** @type {const} */ (["x", "y"]).some(
                        (channel) =>
                            JSON.stringify(
                                captureRegionScale(
                                    this.view
                                        .getScaleResolution(channel)
                                        .getScale()
                                )
                            ) !== JSON.stringify(projection.scales[channel])
                    )
                ) {
                    this.host.onCancel?.();
                    return;
                }
                append(input);
                this.host.onTrace([]);
                const polygon = trace.map(([x, y]) => {
                    const point = bounds.normalizePoint(x, y, true);
                    return /** @type {[number, number]} */ ([point.x, point.y]);
                });
                // Clicks and straight drags are cancellation, not invalid queries.
                if (!hasNonCollinearVertices(polygon)) {
                    this.host.onCancel?.();
                    return;
                }
                this.host.onCommit(
                    createPendingRegionSelection({ ...projection, polygon })
                );
            },
        });
    }
}
