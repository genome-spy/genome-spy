import clientPoint from "../point";
import { html, render } from "lit-html";
import { peek } from "../arrayUtils";

export const SUPPRESS_TOOLTIP_CLASS_NAME = "gs-suppress-tooltip";

export default class Tooltip {
    /**
     * @param {HTMLElement} container
     */
    constructor(container) {
        this.container = container;

        this.element = document.createElement("div");
        this.element.className = "tooltip";
        this._visible = true;
        this.container.appendChild(this.element);

        /** @type {any} */
        this._previousTooltipDatum = undefined;

        this.enabledStack = [true];

        this._penaltyUntil = 0;
        /** @type {[number, number]} */
        this._lastCoords = undefined;

        this._previousMove = 0;

        this.clear();
    }

    /**
     * @param {boolean} visible
     */
    set visible(visible) {
        if (visible != this._visible) {
            this.element.style.display = visible ? null : "none";
            this._visible = visible;
        }
    }

    get visible() {
        return this._visible;
    }

    get enabled() {
        return peek(this.enabledStack) ?? true;
    }

    /**
     * @param {boolean} enabled True if tooltip is enabled (allowed to be shown)
     */
    pushEnabledState(enabled) {
        this.enabledStack.push(enabled);
        if (!enabled) {
            this.visible = false;
        }
    }

    popEnabledState() {
        this.enabledStack.pop();
    }

    /**
     * @param {MouseEvent} mouseEvent
     */
    handleMouseMove(mouseEvent) {
        this.mouseCoords = clientPoint(this.container, mouseEvent);

        const now = performance.now();

        // Prevent the tooltip from flashing briefly before it becomes penalized
        // because of a quickly moving mouse pointer
        if (
            !this.visible &&
            !this._isPenalty() &&
            now - this._previousMove > 500
        ) {
            this._penaltyUntil = now + 70;
        }

        // Disable the tooltip for a while if the mouse is being moved very quickly.
        // Makes the tooltip less annoying.
        // TODO: Should calculate speed: pixels per millisecond or something
        if (
            this._lastCoords &&
            distance(this.mouseCoords, this._lastCoords) > 20
        ) {
            this._penaltyUntil = now + 400;
        }

        this._lastCoords = this.mouseCoords;

        if (this.visible) {
            this.updatePlacement();
        }

        this._previousMove = now;
    }

    updatePlacement() {
        /** Space between pointer and tooltip box */
        const spacing = 20;

        const [mouseX, mouseY] = this.mouseCoords;

        let x = mouseX + spacing;
        if (x > this.container.clientWidth - this.element.offsetWidth) {
            x = mouseX - spacing - this.element.offsetWidth;
        }
        this.element.style.left = x + "px";

        this.element.style.top =
            Math.min(
                mouseY + spacing,
                this.container.clientHeight - this.element.offsetHeight
            ) + "px";
    }

    /**
     * @param {string | import("lit").TemplateResult | HTMLElement} content
     */
    setContent(content) {
        if (!content || !this.enabled || this._isPenalty()) {
            if (this.visible) {
                render("", this.element);
                this.visible = false;
            }
            this._previousTooltipDatum = undefined;
            return;
        }

        render(content, this.element);

        this.visible = true;

        this.updatePlacement();
    }

    clear() {
        this._previousTooltipDatum = undefined;
        this.setContent(undefined);
    }

    /**
     * Updates the tooltip if the provided datum differs from the previous one.
     * Otherwise this is nop.
     *
     * @param {T} datum
     * @param {function(T):Promise<string | HTMLElement | import("lit").TemplateResult>} [converter]
     * @template T
     */
    updateWithDatum(datum, converter) {
        if (datum !== this._previousTooltipDatum) {
            this._previousTooltipDatum = datum;
            if (!converter) {
                converter = (d) =>
                    Promise.resolve(html` ${JSON.stringify(d)} `);
            }

            converter(datum)
                .then((result) => this.setContent(result))
                .catch((error) => {
                    if (error !== "debounced") {
                        throw error;
                    }
                });
        }
    }

    _isPenalty() {
        return this._penaltyUntil && this._penaltyUntil > performance.now();
    }
}

/**
 * Calculate euclidean distance
 *
 * @param {number[]} a
 * @param {number[]} b
 */
function distance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
}
