import clientPoint from './utils/point';

// TODO: Figure out a proper place for this class

export default class Tooltip {

    /**
     * @param {HTMLElement} container 
     */
    constructor(container) {
        this.container = container;

        this.element = document.createElement("div");
        this.element.className = "tooltip";
        this.element.style.visibility = "hidden";
        this.container.appendChild(this.element);
    }

    /**
     * @param {MouseEvent} mouseEvent 
     */
    handleMouseMove(mouseEvent) {
        this.mouseCoords = clientPoint(this.container, mouseEvent);

        if (this.element.style.visibility == "visible") {
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

        this.element.style.top = Math.min(
            mouseY + spacing,
            this.container.clientHeight - this.element.offsetHeight
        ) + "px";
    }

    /**
     * @param {HTMLElement | string} content 
     */
    setContent(content) {
        if (!content) {
            this.element.innerHTML = "";
            this.element.style.visibility = "hidden";
            return;
        }

        if (typeof content == "string") {
            this.element.innerHTML = content;

        } else if (content instanceof HTMLElement) {
            this.element.innerHTML = "";
            this.element.appendChild(content);

        } else {
            this.element.innerText = "Unknown type";
        }

        this.updatePlacement();

        // TODO: update placement
        this.element.style.visibility = "visible";
    }

}