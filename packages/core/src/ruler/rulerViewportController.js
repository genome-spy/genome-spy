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
        this.paramRuntime = paramRuntime;

        this.listeners = [];

        this.update();
        this.#subscribe();
    }

    /** @type {{ scaleResolution: import("../scales/scaleResolution.js").default, type: "domain" | "range", listener: () => void }[]} */
    listeners;

    #subscribe() {
        for (const channel of this.channels) {
            const scaleResolution = this.scaleResolutions[channel];
            const listener = () => this.update();

            scaleResolution.addEventListener("domain", listener);
            scaleResolution.addEventListener("range", listener);
            this.listeners.push(
                { scaleResolution, type: "domain", listener },
                { scaleResolution, type: "range", listener }
            );
        }
    }

    /**
     * Removes scale event listeners owned by this controller.
     */
    dispose() {
        for (const { scaleResolution, type, listener } of this.listeners) {
            scaleResolution.removeEventListener(type, listener);
        }
        this.listeners = [];
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

        this.paramRuntime.setValue(this.paramName, value);
    }
}
