import clientPoint from './point';

export class Zoom {
    constructor(listener) {
        this.scaleExtent = [0, Infinity];
        this.listener = listener;
        this.transform = new Transform();

        this.mouseDown = false;
        this.lastPoint = null;
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
                e => {
                    const point = wheelSnapHandler ?
                        wheelSnapHandler(clientPoint(element, e)) : 
                        clientPoint(element, e);
                    this.handleMouseEvent(e, point, element)
                },
                false));
    }

    zoomTo(transform) {
        this.transform = transform;
        this.listener(this.transform);
    }

    handleMouseEvent(event, point, element) {

        // TODO: Handle window resizes. Record previous clientWidth and adjust k and x accordingly.

        const mouseX = point[0];
        const mouseY = point[1];

        function constrainX(transform) {
            return new Transform(
                transform.k,
                Math.min(0, Math.max(transform.x, -(transform.k - 1) * element.clientWidth))
            );
        }

        if (event.type == "dragstart") {
            return false;

        } else if (event.type == "wheel") {
            event.stopPropagation();
            event.preventDefault();

            const wheelMultiplier = -(event.deltaMode ? 120 : 1);

            if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
                this.transform = constrainX(new Transform(
                    this.transform.k,
                    this.transform.x + event.deltaX * wheelMultiplier));

            } else {
                // https://medium.com/@auchenberg/detecting-multi-touch-trackpad-gestures-in-javascript-a2505babb10e
                // TODO: Safari gestures
                const divisor = event.ctrlKey ? 100 : 500;

                let kFactor = Math.pow(2, event.deltaY * wheelMultiplier / divisor);

                const k = Math.max(Math.min(this.transform.k * kFactor, this.scaleExtent[1]), this.scaleExtent[0]);

                kFactor = k / this.transform.k;

                const x = (this.transform.x - mouseX) * kFactor + mouseX;

                this.transform = constrainX(new Transform(k, x));
            }

            this.listener(this.transform);

        } else if (event.type == "mousedown" && event.button == 0) {
            const referenceTransform = this.transform;

            event.preventDefault();

            const onMousemove = function (moveEvent) {
                this.transform = constrainX(new Transform(this.transform.k, referenceTransform.x + moveEvent.clientX - event.clientX));
                this.listener(this.transform);
            }.bind(this);

            const onMouseup = function (upEvent) {
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
    constructor(k, x) {
        this.k = k || 1;
        this.x = x || 0;
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
        return x.copy().domain(x.range().map(this.invert, this).map(x.invert, x));
    }

    toString() {
        return `translate(${this.x}) scale(${this.k})`;
    }
}