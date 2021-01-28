import clientPoint from "../point";
import { render, TemplateResult } from "lit-html";
import { peek } from "../arrayUtils";

// TODO: Figure out a proper place for this class

export default class Tooltip {
    /**
     * @param {HTMLElement} container
     */
    constructor(container) {
        this.container = container;

        this.element = document.createElement("div");
        this.element.className = "tooltip";
        this.visible = false;
        this.container.appendChild(this.element);

        /** @type {any} */
        this._previousTooltipDatum = undefined;

        this.enabledStack = [true];
    }

    /**
     * @param {boolean} visible
     */
    set visible(visible) {
        this.element.style.display = visible ? "block" : "none";
    }

    get visible() {
        return this.element.style.display == "block";
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
        if (!content || !this.enabled) {
            render("", this.element);
            this.visible = false;
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
        this.setContent(undefined);
        this._previousTooltipDatum = undefined;
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
            this.setContent(
                converter ? converter(datum) : JSON.stringify(datum)
            );
            this._previousTooltipDatum = datum;
        }
    }
}
