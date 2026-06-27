import { asEventConfig } from "../selection/selection.js";
import { createEventFilterFunction } from "../utils/expression.js";
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

        const eventConfig = asEventConfig(config.on ?? "mousemove");
        if (eventConfig.type !== "mousemove") {
            throw new Error(
                `Ruler param "${paramName}" currently supports only "mousemove" in "on".`
            );
        }

        this.eventPredicate = eventConfig.filter
            ? createEventFilterFunction(eventConfig.filter)
            : () => true;
        this.clear = config.clear ?? "mouseleave";

        this.#addListeners();
    }

    /** @type {(event: MouseEvent) => boolean} */
    eventPredicate;

    /** @type {import("../spec/parameter.js").RulerClear | undefined} */
    clear;

    #addListeners() {
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
