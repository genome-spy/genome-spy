import clientPoint from "../point";
import { render, TemplateResult } from "lit-html";
import { peek } from "../arrayUtils";

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

        this._accelerationPenalty = false;
        this._penaltyUntil = 0;
        /** @type {[number, number]} */
        this._lastCoords = undefined;

        this.clear();
    }

    /**
     * @param {boolean} visible
     */
    set visible(visible) {
        if (visible != this._visible) {
            this.element.style.display = visible ? "block" : "none";
            this._visible = visible;
        }
        if (visible) {
            this._accelerationPenalty = false;
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

        // Prevent the tooltip from flashing briefly before it becomes penalized
        // because of a quickly moving mouse pointer
        if (!this.visible && !this._isPenalty() && !this._accelerationPenalty) {
            this._penaltyUntil = performance.now() + 40;
            this._accelerationPenalty = true;
        }

        // Disable the tooltip for a while if the mouse is being moved very quickly.
        // Makes the tooltip less annoying.
        // TODO: Should calculate speed: pixels per millisecond or something
        if (
            this._lastCoords &&
            distance(this.mouseCoords, this._lastCoords) > 50
        ) {
            this._penaltyUntil = performance.now() + 300;
        }

        this._lastCoords = this.mouseCoords;

        if (this.visible) {
            this.updatePlacement();
        }
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
     * @param {string | import("lit-html").TemplateResult} content
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

        if (content instanceof TemplateResult) {
            render(content, this.element);
        } else {
            render(JSON.stringify(content), this.element);
        }

        this.updatePlacement();

        // TODO: update placement
        this.visible = true;
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
     * @param {function(T):(string | import("lit-html").TemplateResult)} [converter]
     * @template T
     */
    updateWithDatum(datum, converter) {
        if (datum !== this._previousTooltipDatum) {
            this._previousTooltipDatum = datum;
            this.setContent(
                converter ? converter(datum) : JSON.stringify(datum)
            );
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
