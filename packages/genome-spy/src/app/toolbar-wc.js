import { html, LitElement, nothing } from "lit";

export default class Toolbar extends LitElement {
    constructor() {
        super();

        /** @type {import("./genomeSpyApp").default} */
        this.app = undefined;
    }

    static get properties() {
        return {
            app: { type: Object }
        };
    }
}
