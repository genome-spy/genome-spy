import { bindRulerDisabled } from "./rulerDisabled.js";
import { invertScalePosition } from "../scales/scalePosition.js";
import {
    asEventConfig,
    createEventPredicate,
    getEventFilterLocation,
    validateEventType,
} from "../utils/interactionConfig.js";
import Point from "../view/layout/point.js";
import { getRulerProjectionCoords } from "../view/scaleProjection.js";
import { ViewInteractionListenerTracker } from "../view/viewInteractionListenerTracker.js";
import { createRulerValue } from "./rulerValue.js";
import { normalizeRulerCoordinate } from "./rulerCoordinate.js";
import { startDocumentDrag } from "../utils/documentDrag.js";

/**
 * Handles pointer-driven ruler updates for a single rendered view.
 */
export class RulerMouseEventController {
    /**
     * @param {import("../view/gridView/gridChild.js").default} gridChild
     * @param {string} paramName
     * @param {import("../spec/parameter.js").RulerConfig} config
     * @param {import("../spec/channel.js").PrimaryPositionalChannel[]} channels
     * @param {Partial<Record<import("../spec/channel.js").PrimaryPositionalChannel, import("../scales/scaleResolution.js").default>>} scaleResolutions
     * @param {import("../paramRuntime/viewParamRuntime.js").default} [paramRuntime]
     */
    constructor(
        gridChild,
        paramName,
        config,
        channels,
        scaleResolutions,
        paramRuntime = gridChild.view.paramRuntime
    ) {
        this.gridChild = gridChild;
        this.paramName = paramName;
        this.config = config;
        this.channels = channels;
        this.scaleResolutions = scaleResolutions;
        this.paramRuntime = paramRuntime;
        this.#viewListeners = new ViewInteractionListenerTracker(
            gridChild.view
        );

        this.eventConfig =
            /** @type {import("../spec/parameter.js").RulerEventConfig} */ (
                asEventConfig(config.on ?? "mousemove")
            );
        validateEventType(
            this.eventConfig,
            ["mousemove", "mousedown"],
            `Ruler param "${paramName}" currently supports only "mousemove" and "mousedown" in "on".`
        );

        this.eventPredicate = createEventPredicate(
            this.eventConfig,
            getEventFilterLocation(paramRuntime, config, "on")
        );
        this.clear =
            config.clear ??
            (this.eventConfig.type === "mousemove" ? "mouseleave" : false);

        this.disposeDisabled = bindRulerDisabled(this);
        this.#addListeners();
    }

    /** @type {ViewInteractionListenerTracker} */
    #viewListeners;

    /** @type {import("../spec/parameter.js").RulerEventConfig} */
    eventConfig;

    /** @type {(event: MouseEvent) => boolean} */
    eventPredicate;

    /** @type {import("../spec/parameter.js").RulerClear | undefined} */
    clear;

    disabled = false;

    dragging = false;

    /** @type {() => boolean} */
    #cancelActiveDrag = () => false;

    /**
     * @param {string} type
     * @param {import("../view/view.js").InteractionListener} listener
     * @param {boolean} [capture]
     */
    #addViewInteractionListener(type, listener, capture) {
        this.#viewListeners.add(
            type,
            (event) => {
                if (!this.disabled) listener(event);
            },
            capture
        );
    }

    dispose() {
        this.#cancelActiveDrag();
        this.disposeDisabled();
        this.#viewListeners.dispose();
    }

    #addListeners() {
        if (this.eventConfig.type === "mousemove") {
            this.#addMousemoveListeners();
        } else {
            this.#addMousedownListeners();
        }
    }

    #addMousemoveListeners() {
        this.#addViewInteractionListener("mousemove", (event) => {
            if (this.eventPredicate(event.proxiedMouseEvent)) {
                this.#setValue(this.#pointToRulerValue(event.point));
            }
        });

        if (this.clear === "mouseleave") {
            this.#addViewInteractionListener("mouseleave", (event) => {
                if (!event.pointedViews.has(this.gridChild.view)) {
                    this.#setValue(createRulerValue(this.channels));
                }
            });
        } else if (this.clear !== false) {
            throw new Error(
                `Ruler param "${this.paramName}" currently supports only "mouseleave" or false in "clear" for mousemove rulers.`
            );
        }
    }

    #addMousedownListeners() {
        this.#addViewInteractionListener("mousedown", (event) => {
            if (
                event.mouseEvent.button !== 0 ||
                !this.eventPredicate(event.proxiedMouseEvent)
            ) {
                return;
            }

            event.stopPropagation();
            this.dragging = true;
            // Keep a document drag anchored to its initiating facet cell.
            const projectionCoords = getRulerProjectionCoords(
                this.gridChild,
                this.channels,
                event.point
            );
            this.#setValue(
                this.#pointToRulerValue(event.point, projectionCoords)
            );

            const viewOffset = Point.fromMouseEvent(event.mouseEvent).subtract(
                new Point(event.point.x, event.point.y)
            );

            const mouseMoveListener = (/** @type {MouseEvent} */ event) => {
                const point = Point.fromMouseEvent(event).subtract(viewOffset);
                this.#setValue(
                    this.#pointToRulerValue(point, projectionCoords)
                );
            };

            this.#cancelActiveDrag = startDocumentDrag({
                onMove: mouseMoveListener,
                onFinish: () => {
                    this.dragging = false;
                },
                onRelease: () => {
                    if (this.clear === "mouseup") {
                        this.#setValue(createRulerValue(this.channels));
                    }
                },
            });
        });

        if (this.clear === "mouseleave") {
            this.#addViewInteractionListener("mouseleave", (event) => {
                if (
                    !this.dragging &&
                    !event.pointedViews.has(this.gridChild.view)
                ) {
                    this.#setValue(createRulerValue(this.channels));
                }
            });
        } else if (this.clear !== false && this.clear !== "mouseup") {
            throw new Error(
                `Ruler param "${this.paramName}" currently supports only "mouseleave", "mouseup", or false in "clear" for mousedown rulers.`
            );
        }
    }

    /**
     * @param {Point} point
     * @param {import("../view/layout/rectangle.js").default} [projectionCoords]
     */
    #pointToRulerValue(
        point,
        projectionCoords = getRulerProjectionCoords(
            this.gridChild,
            this.channels,
            point
        )
    ) {
        const value = createRulerValue(this.channels);
        const normalizedPoint = projectionCoords.normalizePoint(
            point.x,
            point.y,
            true
        );

        for (const channel of this.channels) {
            const scaleResolution = this.scaleResolutions[channel];
            const coordinate = invertScalePosition(
                scaleResolution.getScale(),
                channel === "x" ? normalizedPoint.x : normalizedPoint.y,
                channel === "x"
                    ? projectionCoords.width
                    : projectionCoords.height
            );
            value.values[channel] = normalizeRulerCoordinate(
                coordinate,
                scaleResolution,
                this.config.snap ?? "auto"
            );
        }

        return value;
    }

    /**
     * @param {ReturnType<typeof createRulerValue>} value
     */
    #setValue(value) {
        if (!this.disabled) {
            this.paramRuntime.setValue(this.paramName, value);
        }
    }
}
