import { createRulerValue } from "./rulerValue.js";
import { normalizeRulerCoordinate } from "./rulerCoordinate.js";

/**
 * Tracks the center of a view's current scale viewport.
 */
export class RulerViewportController {
    /**
     * @param {import("../view/gridView/gridChild.js").default} gridChild
     * @param {string} paramName
     * @param {import("../spec/parameter.js").RulerConfig} config
     * @param {import("../spec/channel.js").PrimaryPositionalChannel[]} channels
     * @param {Partial<Record<import("../spec/channel.js").PrimaryPositionalChannel, import("../scales/scaleResolution.js").default>>} scaleResolutions
     */
    constructor(gridChild, paramName, config, channels, scaleResolutions) {
        if (config.on !== undefined) {
            throw new Error(
                `Ruler param "${paramName}" with source "viewport" must not define "on".`
            );
        }

        this.gridChild = gridChild;
        this.paramName = paramName;
        this.config = config;
        this.channels = channels;
        this.scaleResolutions = scaleResolutions;

        this.update();
        this.#subscribe();
    }

    #subscribe() {
        for (const channel of this.channels) {
            const scaleResolution = this.scaleResolutions[channel];
            scaleResolution.addEventListener("domain", () => this.update());
            scaleResolution.addEventListener("range", () => this.update());
        }
    }

    update() {
        const value = createRulerValue(this.channels);

        for (const channel of this.channels) {
            const scaleResolution = this.scaleResolutions[channel];
            const scale = /** @type {{ invert: (value: number) => number }} */ (
                scaleResolution.getScale()
            );
            const coordinate = scale.invert(0.5);
            value.values[channel] = normalizeRulerCoordinate(
                coordinate,
                scaleResolution,
                this.config.snap ?? "auto"
            );
        }

        this.gridChild.view.paramRuntime.setValue(this.paramName, value);
    }
}
