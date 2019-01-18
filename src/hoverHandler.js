
const defaultConverter = obj => new Promise(resolve => resolve(obj));
const defaultEqTest = (a, b) => Object.is(a, b);

export default class HoverHandler {

    constructor(tooltip, converter = defaultConverter, eqTest = defaultEqTest) {
        this.tooltip = tooltip;
        this.currentObject = null;

        this.converter = converter;
        this.eqTest = eqTest;

        this.delay = 250; // in milliseconds
        this.timeoutId = null;
    }


    feed(obj, mouseEvent) {
        if (mouseEvent && mouseEvent.type == "mousemove") {
            this.tooltip.handleMouseMove(mouseEvent);
        }

        if (!this.eqTest(obj, this.currentObject)) {
            if (typeof this.timeoutId == "number") {
                clearTimeout(this.timeoutId);
            }

            if (obj) {
                this.timeoutId = setTimeout(() => {
                    this.converter(obj)
                        .then(content => {
                            // Ensure that the resolved object is still current
                            if (this.eqTest(obj, this.currentObject)) {
                                this.tooltip.setContent(content)
                            }
                        });
                }, this.delay);

            } else {
                this.tooltip.setContent(null);
            }

            //console.log(`HoverHandler current: ${obj}`);
            this.currentObject = obj;
        }
    }

}