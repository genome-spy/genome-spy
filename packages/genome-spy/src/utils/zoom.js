import clientPoint from "./point";
import { peek } from "vega-util";

/**
 * @typedef {Object} ZoomEvent
 * @property {number} mouseX
 * @property {number} mouseY
 * @property {number} deltaX
 * @property {number} deltaY
 * @property {MouseEvent} mouseEvent
 */

export class Zoom {
    /**
     *
     * @param {function(ZoomEvent):void} listener
     */
    constructor(listener) {
        this.listeners = [listener];

        this.mouseDown = false;
        this.lastPoint = null;

        this.zoomInertia = new Inertia();
    }

    /**
     *
     * @param {ZoomEvent} zoomEvent
     */
    _dispatch(zoomEvent) {
        peek(this.listeners)(zoomEvent);
    }

    /**
     *
     * @param {function(ZoomEvent):void} listener
     */
    pushListener(listener) {
        this.listeners.push(listener);
        return this.listeners[this.listeners.length - 2];
    }

    popListener() {
        if (this.listeners.length > 1) {
            this.zoomInertia.cancel();
            return this.listeners.pop();
        } else {
            throw new Error("Cannot pop the initial listener!");
        }
    }

    /**
     * Adds mouse/touch listeners for zoom
     *
     * @param {object} element
     * @param {function(number[]):(number[]|undefined)} [wheelSnapHandler]
     */
    attachZoomEvents(element, wheelSnapHandler) {
        ["mousedown", "wheel", "dragstart"].forEach(type =>
            element.addEventListener(
                type,
                /** @param {MouseEvent} e */
                e => {
                    const point = wheelSnapHandler
                        ? wheelSnapHandler(clientPoint(element, e))
                        : clientPoint(element, e);
                    this.handleMouseEvent(e, point, element);
                },
                false
            )
        );
    }

    /**
     *
     * @param {MouseEvent} event
     * @param {*} point
     * @param {HTMLElement} element
     */
    handleMouseEvent(event, point, element) {
        // TODO: Handle window resizes. Record previous clientWidth and adjust k and x accordingly.

        const mouseX = point[0];
        const mouseY = point[1];

        /** @type {ZoomEvent} */
        const zoomEvent = {
            mouseX,
            mouseY,
            deltaX: 0,
            deltaY: 0,
            mouseEvent: event
        };

        if (event.type == "dragstart") {
            return false;
        } else if (isWheelEvent(event)) {
            event.stopPropagation();
            event.preventDefault();

            const wheelMultiplier = -(event.deltaMode ? 120 : 1);

            if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
                zoomEvent.deltaX = event.deltaX * wheelMultiplier;
                this._dispatch(zoomEvent);
            } else {
                // https://medium.com/@auchenberg/detecting-multi-touch-trackpad-gestures-in-javascript-a2505babb10e
                // TODO: Safari gestures
                const pinchMultiplier = event.ctrlKey ? 5 : 1;

                const callback = /** @param {number} deltaY */ deltaY => {
                    zoomEvent.deltaY = deltaY;
                    this._dispatch(zoomEvent);
                };

                this.zoomInertia.setMomentum(
                    event.deltaY * wheelMultiplier * pinchMultiplier,
                    callback
                );
            }
        } else if (event.type == "mousedown" && event.button == 0) {
            this.zoomInertia.cancel();
            event.preventDefault();

            let prevMouseEvent = event;

            const onMousemove = /** @param {MouseEvent} moveEvent */ moveEvent => {
                zoomEvent.deltaX = moveEvent.clientX - prevMouseEvent.clientX;
                prevMouseEvent = moveEvent;

                this._dispatch(zoomEvent);
            };

            const onMouseup = /** @param {MouseEvent} upEvent */ upEvent => {
                document.removeEventListener("mousemove", onMousemove);
                document.removeEventListener("mouseup", onMouseup);
            };

            document.addEventListener("mouseup", onMouseup, false);
            document.addEventListener("mousemove", onMousemove, false);
        }
    }
}

/**
 * Partially based on d3-zoom:
 * https://github.com/d3/d3-zoom/ Copyright 2010-2016 Mike Bostock
 */
export class Transform {
    /**
     * @param {number} k
     * @param {number} x
     */
    constructor(k = 1, x = 0) {
        this.k = k;
        this.x = x;
    }

    scale(k) {
        return new Transform(this.k * k, this.x);
    }

    translate(x) {
        return new Transform(this.k, this.x + this.k * x);
    }

    invert(x) {
        return (x - this.x) / this.k;
    }

    rescale(x) {
        return x.copy().domain(
            x
                .range()
                .map(this.invert, this)
                .map(x.invert, x)
        );
    }

    toString() {
        return `translate(${this.x}) scale(${this.k})`;
    }
}

/**
 * Creates some inertia, mainly for zooming with a mechanical mouse wheel
 */
class Inertia {
    constructor() {
        this.damping = 0.99999;
        this.maxInitialMomentum = 200; // TODO: Proper acceleration
        this.lowerLimit = 0.2; // When to stop updating
        this.clear();
    }

    clear() {
        this.momentum = 0;
        this.timestamp = null;
        this.loop = null;
        this.callback = null;
    }

    cancel() {
        if (this.loop) {
            window.cancelAnimationFrame(this.loop);
            this.clear();
        }
    }

    /**
     *
     * @param {number} value
     * @param {function(number):void} callback
     */
    setMomentum(value, callback) {
        if (value * this.momentum < 0) {
            this.momentum = 0;
        } else if (this.momentum == 0) {
            value =
                Math.min(Math.abs(value), this.maxInitialMomentum) *
                Math.sign(value);
        }

        this.momentum = value;
        this.callback = callback;

        if (!this.loop) {
            this.animate();
        }
    }

    /**
     *
     * @param {number} [timestamp]
     */
    animate(timestamp) {
        const timeDelta = timestamp - this.timestamp || 0;
        this.timestamp = timestamp;

        const damp = Math.pow(1 - this.damping, timeDelta / 1000);
        this.momentum *= damp;

        this.callback(this.momentum);
        if (Math.abs(this.momentum) > this.lowerLimit) {
            this.loop = window.requestAnimationFrame(this.animate.bind(this));
        } else {
            this.clear();
        }
    }
}

/**
 *
 * @param {MouseEvent} mouseEvent
 * @returns {mouseEvent is WheelEvent}
 */
function isWheelEvent(mouseEvent) {
    return mouseEvent.type == "wheel";
}
