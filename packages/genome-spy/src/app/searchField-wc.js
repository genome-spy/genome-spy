import { html, LitElement, nothing } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { guard } from "lit/directives/guard.js";
import { zoomLinear } from "vega-util";

import { SampleAttributePanel } from "../view/sampleView/sampleAttributePanel";
import { sampleIterable } from "../data/transforms/sample";
import { debounce } from "../utils/debounce";
import { VISIT_STOP } from "../view/view";

export default class SearchField extends LitElement {
    constructor() {
        super();

        this.inputRef = createRef();

        /** @type {import("../genomeSpy").default} */
        this.genomeSpy = undefined;

        /** @type {function():string} */
        this.getFormattedDomain = () => "";

        this._keyListener = this._onKeyDown.bind(this);
    }

    static get properties() {
        return {
            genomeSpy: { type: Object }
        };
    }

    connectedCallback() {
        super.connectedCallback();
        this._initializeGenome();

        document.addEventListener("keydown", this._keyListener);
    }

    disconnectedCallback() {
        super.disconnectedCallback();

        document.removeEventListener("keydown", this._keyListener);
        // TODO: remove listener from resolutions
    }

    createRenderRoot() {
        return this;
    }

    /**
     *
     * @param {KeyboardEvent} event
     */
    _onKeyDown(event) {
        switch (event.code) {
            case "KeyF":
                if (!(event.metaKey || event.altKey || event.ctrlKey)) {
                    event.preventDefault();
                    const input = /** @type {HTMLInputElement} */ (this.inputRef
                        .value);
                    input.focus();
                }
                break;
            default:
        }
    }

    _initializeGenome() {
        const genomeResolution = findGenomeScaleResolution(
            this.genomeSpy.viewRoot
        );
        if (genomeResolution) {
            this._genomeResolution = genomeResolution;
            this._genome = this.genomeSpy.genomeStore.getGenome();

            this.getFormattedDomain = () =>
                this._genome.formatInterval(
                    genomeResolution.getScale().domain()
                );

            genomeResolution.addScaleObserver(
                debounce(() => this.requestUpdate(), 60, false)
            );
        }
    }

    /**
     * @param {string} term
     */
    searchViews(term) {
        const collator = new Intl.Collator("en", {
            usage: "search",
            sensitivity: "base"
        });
        for (const view of this.genomeSpy.getSearchableViews()) {
            const sa = view.getAccessor("search");

            const xa = view.getAccessor("x");
            const x2a = view.getAccessor("x2");
            const xResolution = view.getScaleResolution("x");

            // TODO: y

            if (!xa || !x2a || !xResolution?.isZoomable()) {
                continue;
            }

            for (const d of view.getCollector()?.getData()) {
                if (collator.compare(sa(d), term) === 0) {
                    const interval = zoomLinear([xa(d), x2a(d)], null, 1.2);
                    xResolution.zoomTo(interval);
                    view.context.animator.requestRender();
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * @param {string} term
     */
    // eslint-disable-next-line require-await
    async search(term) {
        if (this._genomeResolution && this._genome) {
            const interval = this._genome.parseInterval(term);
            if (interval) {
                this._genomeResolution.zoomTo(interval);
                this.genomeSpy.animator.requestRender();
                return;
            }
        }

        if (this.searchViews(term)) {
            return;
        }

        this.genomeSpy.viewRoot.visit(view => {
            if (view instanceof SampleAttributePanel) {
                view.handleVerboseCommand(term);
            }
        });
    }

    /**
     *
     * @param {MouseEvent} event
     */
    _onSearchHelpClicked(event) {
        const element = /** @type {HTMLElement} */ (event.target);
        if (element.tagName == "LI") {
            this._doExampleSearch(element.innerText);
        }
    }

    /** @param {FocusEvent} event */
    _onSearchFocused(event) {
        const searchInput = /** @type {HTMLInputElement} */ (event.target);
        searchInput.select();
    }

    /**
     *
     * @param {KeyboardEvent} event
     */
    _onSearchKeyDown(event) {
        const searchInput = /** @type {HTMLInputElement} */ (event.target);
        if (event.code == "Enter") {
            event.preventDefault();

            this.search(searchInput.value)
                .then(() => {
                    searchInput.focus();
                    searchInput.select();
                })
                .catch(reason => {
                    console.log(reason);
                    alert(reason);
                });
        } else if (event.code == "Escape") {
            searchInput.blur();
        } else {
            event.stopPropagation();
        }
    }

    /**
     *
     * @param {string} term
     */
    _doExampleSearch(term) {
        const searchInput = /** @type {HTMLInputElement} */ (this.inputRef
            .value);

        typeSlowly(term, searchInput).then(() => {
            searchInput.blur();
            this.search(term);
        });
    }

    _getSearchHelp() {
        /** @type {import("lit").TemplateResult[]} */
        const parts = [];

        parts.push(html`
            <p>Focus to a specific range. Examples:</p>
            <ul>
                <!-- TODO: Display only when using a genomic coordinate system-->
                <li>chr8:21,445,873-24,623,697</li>
                <li>chr4:166,014,727-chr15:23,731,397</li>
            </ul>
        `);

        for (const view of this.genomeSpy?.getSearchableViews() || []) {
            const viewTitle = view.spec.title ?? view.spec.name;
            const a = view.getAccessor("search");
            const fieldString = a.fields.join(", "); // TODO: Field title

            const examples = sampleIterable(
                3,
                view.getCollector().getData(),
                a
            );

            parts.push(html`
                <p>Search <em>${viewTitle}</em> (${fieldString}). Examples:</p>
                <ul>
                    ${examples.map(
                        example =>
                            html`
                                <li>${example}</li>
                            `
                    )}
                </ul>
            `);
        }

        return html`
            <div class="search-help" @click=${this._onSearchHelpClicked}>
                ${parts}
            </div>
        `;
    }

    render() {
        return html`
            <div class="search">
                <input
                    type="text"
                    class="search-input"
                    .value=${this.getFormattedDomain()}
                    @keydown=${this._onSearchKeyDown.bind(this)}
                    @focus=${this._onSearchFocused}
                    ${ref(this.inputRef)}
                />
                ${guard([123], () => this._getSearchHelp())}
            </div>
        `;
    }
}

customElements.define("genome-spy-search-field", SearchField);

/**
 *
 * @param {string} text
 * @param {HTMLInputElement} element
 */
function typeSlowly(text, element) {
    return new Promise(resolve => {
        let i = 0;
        const delay = 700 / text.length + 30;

        function next() {
            element.value = text.substring(0, i);

            if (i >= text.length) {
                setTimeout(resolve, 500);
            } else {
                i++;
                setTimeout(next, Math.random() * delay * 2);
            }
        }

        next();
    });
}

/**
 * Finds a scale resolution that has a zoomable locus scale
 *
 * @param {import("../view/view").default} viewRoot
 */
export function findGenomeScaleResolution(viewRoot) {
    /** @type {import("../view/scaleResolution").default} */
    let match;

    viewRoot.visit(view => {
        for (const channel of ["x", "y"]) {
            const resolution = view.resolutions.scale[channel];
            if (
                resolution &&
                resolution.type == "locus" &&
                resolution.isZoomable()
            ) {
                match = resolution;
                return VISIT_STOP;
            }
        }
    });

    return match;
}
