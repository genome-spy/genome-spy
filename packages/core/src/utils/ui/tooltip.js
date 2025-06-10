import clientPoint from "../point.js";
import { html, render } from "lit";
import { peek } from "../arrayUtils.js";

export const SUPPRESS_TOOLTIP_CLASS_NAME = "gs-suppress-tooltip";

export default class Tooltip {
    #sticky = false;
    #visible = true;

    /** @type {any} */
    #previousTooltipDatum = undefined;

    #penaltyUntil = 0;

    /** @type {[number, number]} */
    #lastCoords = undefined;

    #previousMove = 0;

    /** @type {HTMLDivElement} */
    #element;

    /** @type {HTMLElement} */
    #container;

    #enabledStack = [true];

    /**
     * @param {HTMLElement} container
     */
    constructor(container) {
        this.#container = container;

        this.#element = document.createElement("div");
        this.#element.className = "tooltip";
        this.#container.appendChild(this.#element);

        this.clear();
    }

    /**
     * @param {boolean} sticky
     */
    set sticky(sticky) {
        if (!sticky && this.#sticky) {
            this.clear();
        }
        this.#sticky = sticky;
        this.#element.classList.toggle("sticky", this.#sticky);
    }

    get sticky() {
        return this.#sticky;
    }

    /**
     * @param {boolean} visible
     */
    set visible(visible) {
        if (visible != this.#visible) {
            this.#element.style.display = visible ? null : "none";
            this.#visible = visible;
        }
    }

    get visible() {
        return this.#visible;
    }

    get enabled() {
        return peek(this.#enabledStack) ?? true;
    }

    /**
     * @param {boolean} enabled True if tooltip is enabled (allowed to be shown)
     */
    pushEnabledState(enabled) {
        this.#enabledStack.push(enabled);
        if (!enabled) {
            this.visible = false;
        }
    }

    popEnabledState() {
        this.#enabledStack.pop();
    }

    /**
     * @param {MouseEvent} mouseEvent
     */
    handleMouseMove(mouseEvent) {
        if (this.#sticky) {
            return;
        }

        this.mouseCoords = clientPoint(this.#container, mouseEvent);

        const now = performance.now();

        // Prevent the tooltip from flashing briefly before it becomes penalized
        // because of a quickly moving mouse pointer
        if (
            !this.visible &&
            !this._isPenalty() &&
            now - this.#previousMove > 500
        ) {
            this.#penaltyUntil = now + 70;
        }

        // Disable the tooltip for a while if the mouse is being moved very quickly.
        // Makes the tooltip less annoying.
        // TODO: Should calculate speed: pixels per millisecond or something
        if (
            this.#lastCoords &&
            distance(this.mouseCoords, this.#lastCoords) > 20
        ) {
            this.#penaltyUntil = now + 400;
        }

        this.#lastCoords = this.mouseCoords;

        if (this.visible) {
            this.updatePlacement();
        }

        this.#previousMove = now;
    }

    updatePlacement() {
        /** Space between pointer and tooltip box */
        const spacing = 20;

        const [mouseX, mouseY] = this.mouseCoords;

        let x = mouseX + spacing;
        if (x > this.#container.clientWidth - this.#element.offsetWidth) {
            x = mouseX - spacing - this.#element.offsetWidth;
        }
        this.#element.style.left = x + "px";

        this.#element.style.top =
            Math.min(
                mouseY + spacing,
                this.#container.clientHeight - this.#element.offsetHeight
            ) + "px";
    }

    /**
     * @param {string | import("lit").TemplateResult | HTMLElement} content
     */
    setContent(content) {
        if (this.#sticky) {
            return;
        }

        if (!content || !this.enabled || this._isPenalty()) {
            if (this.visible) {
                render("", this.#element);
                this.visible = false;
            }
            this.#previousTooltipDatum = undefined;
            return;
        }

        render(content, this.#element);

        this.visible = true;

        this.updatePlacement();
    }

    clear() {
        this.#previousTooltipDatum = undefined;
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
        if (datum !== this.#previousTooltipDatum) {
            this.#previousTooltipDatum = datum;
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
        return this.#penaltyUntil && this.#penaltyUntil > performance.now();
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
