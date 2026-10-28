import {
    parseCoordinates,
    formatCoordinates,
} from "@genome-spy/core/coordinates";
import { html, LitElement } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { guard } from "lit/directives/guard.js";
import { zoomLinear } from "vega-util";

import { MetadataView } from "../../sampleView/metadata/metadataView.js";
import { debounce } from "@genome-spy/core/utils/debounce.js";
import { VISIT_STOP } from "@genome-spy/core/view/view.js";
import SubscriptionController from "../generic/subscriptionController.js";

export default class SearchField extends LitElement {
    constructor() {
        super();

        this.inputRef = createRef();

        /** @type {import("../../app.js").default} */
        this.app = undefined;

        this._focused = false;
        this._subscriptions = new SubscriptionController(this);
        /** @type {function():string} */
        this.getDefaultValue = () => "";
    }

    get genomeSpy() {
        return this.app.genomeSpy;
    }

    get _inputField() {
        return /** @type {HTMLInputElement} */ (this.inputRef.value);
    }

    static get properties() {
        return {
            app: { type: Object },
        };
    }

    connectedCallback() {
        super.connectedCallback();
        this._initializeGenome();

        const documentClickListener = (/** @type {InputEvent} */ event) => {
            if (event.target !== this._inputField) {
                this._inputField?.blur();
            }
        };

        document.addEventListener("click", documentClickListener);

        this._subscriptions.addUnsubscribeCallback(() =>
            document.removeEventListener("click", documentClickListener)
        );
    }

    createRenderRoot() {
        return this;
    }

    focusInput() {
        this._inputField?.focus();
    }

    _initializeGenome() {
        const genomeResolution = findGenomeScaleResolution(
            this.genomeSpy.viewRoot
        );
        if (genomeResolution) {
            this._genomeResolution = genomeResolution;
            this.getDefaultValue = () => {
                const [begin, end] =
                    /** @type {import("@genome-spy/core/types/coordinates.js").CoordinateLocus[]} */ (
                        genomeResolution.getComplexDomain()
                    );
                return formatCoordinates([
                    /** @type {import("@genome-spy/core/types/coordinates.js").CoordinateLocus} */ (
                        begin
                    ),
                    { chrom: end.chrom, pos: end.pos + 1 },
                ]);
            };

            const domainListener = debounce(
                () => this.requestUpdate(),
                60,
                false
            );
            genomeResolution.addEventListener("domain", domainListener);
            this._subscriptions.addUnsubscribeCallback(() =>
                genomeResolution.removeEventListener("domain", domainListener)
            );
        }
    }

    /**
     * @param {string} term
     */
    async searchViews(term) {
        const { matches } = this.app.datumSearch.findDatums(term, {
            limit: 1,
            target: "zoomable",
        });
        const target = matches[0]?.targets.find(
            (candidate) => candidate.zoomable
        );
        if (!target) return false;

        const interval = zoomLinear(target.interval, null, 1.2);
        if (target.kind === "locus") {
            const size = target.scale
                .getAssembly()
                .contigs.reduce((sum, contig) => sum + contig.size, 0);
            interval[0] = Math.max(0, interval[0]);
            interval[1] = Math.min(size, interval[1]) - 1;
        }
        await target.scale.zoomTo(interval);
        return true;
    }

    /**
     * @param {string} term
     */
    async search(term) {
        const doSearch = async () => {
            if (this._genomeResolution) {
                const parsed = parseCoordinates(
                    term,
                    this._genomeResolution.getAssembly()
                );
                if (parsed.kind === "invalid-coordinate")
                    throw new Error(parsed.message);
                if (parsed.kind === "coordinate") {
                    const [begin, end] = parsed.interval;
                    await this._genomeResolution.zoomTo([
                        begin,
                        { chrom: end.chrom, pos: end.pos - 1 },
                    ]);
                    return;
                }

                if (await this.searchViews(term)) {
                    return;
                }

                // TODO: A proper api for registering searchable stuff
                this.genomeSpy.viewRoot.visit((view) => {
                    if (view instanceof MetadataView) {
                        // TODO: Await
                        view.handleVerboseCommand(term);
                    }
                });
            }
        };

        await doSearch();

        // Directly modifying the HTMLElement. Should be done through the template
        // but it doesn't quite work when the template-provided value wasn't changed...
        this._inputField.value = this.getDefaultValue();
        this.requestUpdate();
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

    /**
     * @param {FocusEvent} event
     */
    _onSearchFocused(event) {
        const searchInput = /** @type {HTMLInputElement} */ (event.target);
        switch (event.type) {
            case "focus":
                this._focused = true;
                searchInput.select();
                break;
            case "blur":
                this._focused = false;
                break;
            default:
        }
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
                .catch((reason) => {
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
        typeSlowly(term, this._inputField).then(() => {
            this._inputField.blur();
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
                <li>chr8</li>
                <li>chr8:21,445,873</li>
                <li>chr8:21,445,873-24,623,697</li>
                <li>chr4:166,014,727-chr15:23,731,397</li>
            </ul>
        `);

        for (const view of this.app.datumSearch.listSearchableViews({
            exampleLimit: 3,
        })) {
            const examples = Array.from(
                new Set(view.fields.flatMap((field) => field.examples))
            ).slice(0, 3);
            parts.push(html`
                <p>
                    Search
                    <em>${view.title}</em>
                    (${view.fields.map((field) => field.field).join(", ")}).
                    Examples:
                </p>
                <ul>
                    ${examples.map((example) => html`<li>${example}</li>`)}
                </ul>
            `);
        }

        const metadataView = this.app.getSampleView()?.metadataView;
        if (metadataView) {
            const categoricalInfos = metadataView
                .getAttributeNames()
                .map((name) => metadataView.getAttributeInfo(name))
                .filter(
                    (info) => info.type == "nominal" || info.type == "ordinal"
                )
                .sort(() => 0.5 - Math.random())
                .map(
                    (info) =>
                        [...(info.scale?.domain() ?? [])].sort(
                            () => 0.5 - Math.random()
                        )[0]
                )
                .filter((value) => value !== undefined)
                .slice(0, 3);

            if (categoricalInfos.length) {
                parts.push(
                    html` <p>
                            Filter samples by categorical attributes. Examples:
                        </p>
                        <ul>
                            ${categoricalInfos.map(
                                (value) => html`<li>${value}</li>`
                            )}
                        </ul>`
                );
            }
        }

        return html`
            <div class="search-help" @click=${this._onSearchHelpClicked}>
                ${parts}
            </div>
        `;
    }

    /**
     * @param {Map<string, any>} changedProperties
     */
    updated(changedProperties) {
        if (this._focused) {
            this._inputField.select();
        }
    }

    render() {
        return html`
            <div class="search">
                <input
                    type="text"
                    class="search-input"
                    .value=${this.getDefaultValue()}
                    @mousedown=${
                        /** @param {MouseEvent} event */ (event) => {
                            if (!this._focused) {
                                // Do some hacking to get consistent selection behavior
                                this._inputField.focus();
                                event.preventDefault();
                                event.stopPropagation();
                            }
                        }
                    }
                    @keydown=${this._onSearchKeyDown.bind(this)}
                    @focus=${this._onSearchFocused}
                    @blur=${this._onSearchFocused}
                    ${ref(this.inputRef)}
                />
                ${guard(
                    this.app.datumSearch
                        .listSearchableViews({ exampleLimit: 0 })
                        .flatMap(({ view, source }) => [
                            view.id,
                            source.dataRevision,
                            source.readiness,
                        ]),
                    () => this._getSearchHelp()
                )}
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
    return new Promise((resolve) => {
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
 * @param {import("@genome-spy/core/view/view.js").default} viewRoot
 */
export function findGenomeScaleResolution(viewRoot) {
    /** @type {import("@genome-spy/core/scales/scaleResolution.js").default} */
    let match;

    viewRoot.visit((view) => {
        for (const channel of /** @type {import("@genome-spy/core/spec/channel.js").PrimaryPositionalChannel[]} */ ([
            "x",
            "y",
        ])) {
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
