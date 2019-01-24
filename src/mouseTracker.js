import * as d3 from "d3";

const defaultConverter = obj => new Promise(resolve => resolve(obj));
const defaultEqTest = (a, b) => Object.is(a, b);

/**
 * A tool for tracking mouse movement and handling tooltips etc...
 * 
 * @typedef {Object} ConstructorParams
 * @prop {HTMLElement} element element to observe
 * @prop {function} resolver function that resolves an object based on its coordinates
 * @prop {import("./tooltip").default} [tooltip] tooltip
 * @prop {function} [tooltipConverter] function that converts the object to html for tooltip
 * @prop {function} [eqTest] function that tests whether two objects are equal
 * 
 */
export default class MouseTracker {

    /**
     * @param {ConstructorParams} params parameters
     */
    constructor({ element, resolver, tooltip, tooltipConverter = defaultConverter, eqTest = defaultEqTest }) {
        
        this.element = element;
        this.resolver = resolver;
        this.tooltip = tooltip;
        this.tooltipConverter = tooltipConverter;
        this.eqTest = eqTest;

        this.currentTooltipObject = null;

        this.tooltipDelay = 250; // in milliseconds

        this.timeoutId = null;

        for (let type of ["mousemove", "mouseleave", "wheel"]) {
            element.addEventListener(type, event => this._handleMouseEvent(/** @type {MouseEvent} */(event)), false);
        }
    }

    /**
     * @param {MouseEvent} event 
     */
    _handleMouseEvent(event) {
        let resolvedObject = null;

        if (event.type == "mousemove") {
            resolvedObject = this.resolver(d3.clientPoint(this.element, event));

            if (this.tooltip) {
                this.tooltip.handleMouseMove(event);
            }

        } else if (event.type == "mouseleave") {
            resolvedObject = null;

        } else if (event.type == "wheel") {
            // Hide tooltip when wheeled
            resolvedObject = null;

        } else {
            throw "Unexpected event: " + event.type;
        }

        this._updateTooltip(resolvedObject);
    }


    _updateTooltip(obj) {
        if (!this.tooltip) {
            return;
        }

        if (!this.eqTest(obj, this.currentTooltipObject)) {
            if (typeof this.timeoutId == "number") {
                clearTimeout(this.timeoutId);
            }

            if (obj) {
                this.timeoutId = setTimeout(() => {
                    this.tooltipConverter(obj)
                        .then(content => {
                            // Ensure that the resolved object is still current
                            if (this.eqTest(obj, this.currentTooltipObject)) {
                                this.tooltip.setContent(content)
                            }
                        });
                }, this.tooltipDelay);

            } else {
                this.tooltip.setContent(null);
            }

            //console.log(`HoverHandler current: ${obj}`);
            this.currentTooltipObject = obj;
        }
    }

}