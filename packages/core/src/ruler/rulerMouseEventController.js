import { asEventConfig } from "../selection/selection.js";
import { createEventFilterFunction } from "../utils/expression.js";
import Point from "../view/layout/point.js";
import { createRulerValue } from "./rulerValue.js";
import { normalizeRulerCoordinate } from "./rulerCoordinate.js";

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
     */
    constructor(gridChild, paramName, config, channels, scaleResolutions) {
        this.gridChild = gridChild;
        this.paramName = paramName;
        this.config = config;
        this.channels = channels;
        this.scaleResolutions = scaleResolutions;

        this.eventConfig = asEventConfig(config.on ?? "mousemove");
        if (
            this.eventConfig.type !== "mousemove" &&
            this.eventConfig.type !== "mousedown"
        ) {
            throw new Error(
                `Ruler param "${paramName}" currently supports only "mousemove" and "mousedown" in "on".`
            );
        }

        this.eventPredicate = this.eventConfig.filter
            ? createEventFilterFunction(this.eventConfig.filter)
            : () => true;
        this.clear =
            config.clear ??
            (this.eventConfig.type === "mousemove" ? "mouseleave" : false);

        this.#addListeners();
    }

    /** @type {import("../spec/parameter.js").RulerEventConfig} */
    eventConfig;

    /** @type {(event: MouseEvent) => boolean} */
    eventPredicate;

    /** @type {import("../spec/parameter.js").RulerClear | undefined} */
    clear;

    dragging = false;

    #addListeners() {
        if (this.eventConfig.type === "mousemove") {
            this.#addMousemoveListeners();
        } else {
            this.#addMousedownListeners();
        }
    }

    #addMousemoveListeners() {
        const { view } = this.gridChild;

        view.addInteractionListener("mousemove", (event) => {
            if (this.eventPredicate(event.proxiedMouseEvent)) {
                this.#setValue(this.#pointToRulerValue(event.point));
            }
        });

        if (this.clear === "mouseleave") {
            view.addInteractionListener("mouseleave", () => {
                this.#setValue(createRulerValue(this.channels));
            });
        } else if (this.clear !== false) {
            throw new Error(
                `Ruler param "${this.paramName}" currently supports only "mouseleave" or false in "clear" for mousemove rulers.`
            );
        }
    }

    #addMousedownListeners() {
        const { view } = this.gridChild;

        view.addInteractionListener("mousedown", (event) => {
            if (
                event.mouseEvent.button !== 0 ||
                !this.eventPredicate(event.proxiedMouseEvent)
            ) {
                return;
            }

            event.stopPropagation();
            this.dragging = true;
            this.#setValue(this.#pointToRulerValue(event.point));

            const viewOffset = Point.fromMouseEvent(event.mouseEvent).subtract(
                new Point(event.point.x, event.point.y)
            );

            const mouseMoveListener = (/** @type {MouseEvent} */ event) => {
                const point = Point.fromMouseEvent(event).subtract(viewOffset);
                this.#setValue(this.#pointToRulerValue(point));
            };

            const mouseUpListener = () => {
                document.removeEventListener("mousemove", mouseMoveListener);
                document.removeEventListener("mouseup", mouseUpListener);
                this.dragging = false;

                if (this.clear === "mouseup") {
                    this.#setValue(createRulerValue(this.channels));
                }
            };

            document.addEventListener("mousemove", mouseMoveListener);
            document.addEventListener("mouseup", mouseUpListener);
        });

        if (this.clear === "mouseleave") {
            view.addInteractionListener("mouseleave", () => {
                if (!this.dragging) {
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
     * @param {{ x: number, y: number }} point
     */
    #pointToRulerValue(point) {
        const value = createRulerValue(this.channels);
        const normalizedPoint = this.gridChild.view.coords.normalizePoint(
            point.x,
            point.y,
            true
        );

        for (const channel of this.channels) {
            const scaleResolution = this.scaleResolutions[channel];
            const scale = scaleResolution.getScale();
            const coordinate = scale.invert(
                channel === "x" ? normalizedPoint.x : normalizedPoint.y
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
        this.gridChild.view.paramRuntime.setValue(this.paramName, value);
    }
}
