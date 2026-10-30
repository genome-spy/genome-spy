import {
    parseCoordinates,
    formatCoordinates,
} from "@genome-spy/core/coordinates";
import { html, LitElement } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { guard } from "lit/directives/guard.js";
import { zoomLinear } from "vega-util";

import { MetadataView } from "../../sampleView/metadata/metadataView.js";
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
        this.hierarchyRevision = 0;
    }

    /** @type {import("@genome-spy/core/types/scaleResolutionApi.js").ScaleResolutionApi} */
    _genomeResolution;

    get _inputField() {
        return /** @type {HTMLInputElement} */ (this.inputRef.value);
    }

    static get properties() {
        return {
            app: { type: Object },
            _focused: { state: true },
            hierarchyRevision: { type: Number },
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

    shouldUpdate() {
        return this.isConnected;
    }

    focusInput() {
        this._inputField?.focus();
    }

    _initializeGenome() {
        const resolution = findGenomeScaleResolution(
            this.app.genomeSpy.viewRoot
        );
        if (!resolution)
            throw new Error(
                "The search field requires a zoomable locus scale."
            );
        this._genomeResolution = resolution;

        /** @type {ReturnType<typeof setTimeout> | undefined} */
        let timeout;
        const listener = () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => this.requestUpdate(), 60);
        };
        resolution.addEventListener("domain", listener);
        this._subscriptions.addUnsubscribeCallback(() => {
            resolution.removeEventListener("domain", listener);
            clearTimeout(timeout);
        });
    }

    getDefaultValue() {
        const [begin, end] =
            /** @type {import("@genome-spy/core/types/coordinates.js").CoordinateLocus[]} */ (
                this._genomeResolution.getComplexDomain()
            );
        // Domain endpoints are detached, inclusive snapshots; display is half-open.
        end.pos++;
        return formatCoordinates([begin, end]);
    }

    /** @param {string} term */
    async search(term) {
        const parsed = parseCoordinates(
            term,
            this._genomeResolution.getAssembly()
        );
        if (parsed.kind === "invalid-coordinate")
            throw new Error(parsed.message);
        if (parsed.kind === "coordinate") {
            const [begin, end] = parsed.interval;
            end.pos--; // Native scale navigation has an inclusive upper endpoint.
            await this._genomeResolution.zoomTo([begin, end]);
        } else {
            const { matches } = this.app.datumSearch.findDatums(term, {
                limit: 1,
                target: "zoomable",
            });
            const target = matches[0]?.targets.find(
                (candidate) => candidate.zoomable
            );
            if (target) {
                const interval = zoomLinear(target.interval, null, 1.2);
                if (target.kind === "locus") {
                    const size = target.scale
                        .getAssembly()
                        .contigs.reduce((sum, contig) => sum + contig.size, 0);
                    interval[0] = Math.max(0, interval[0]);
                    interval[1] = Math.min(size, interval[1]) - 1;
                }
                await target.scale.zoomTo(interval);
            } else {
                this.app.genomeSpy.viewRoot.visit((view) => {
                    if (view instanceof MetadataView)
                        view.handleVerboseCommand(term);
                });
            }
        }

        // The input may have been edited without changing the template's bound value.
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
        const revision = this.hierarchyRevision;
        typeSlowly(term, this._inputField).then(() => {
            if (!this.isConnected || revision !== this.hierarchyRevision)
                return;
            this._inputField.blur();
            this.search(term);
        });
    }

    _getSearchHelp() {
        const parts = [
            html`
                <p>Focus to a specific range. Examples:</p>
                <ul>
                    <li>chr8</li>
                    <li>chr8:21,445,873</li>
                    <li>chr8:21,445,873-24,623,697</li>
                    <li>chr4:166,014,727-chr15:23,731,397</li>
                </ul>
            `,
        ];

        for (const {
            title,
            fields,
        } of this.app.datumSearch.listSearchableViews({ exampleLimit: 3 })) {
            for (const { field, examples } of fields) {
                parts.push(html`
                    <p>Search <em>${title}</em> (${field}). Examples:</p>
                    <ul>
                        ${examples.map((example) => html`<li>${example}</li>`)}
                    </ul>
                `);
            }
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
                    [
                        this.hierarchyRevision,
                        ...this.app.datumSearch
                            .listSearchableViews({ exampleLimit: 0 })
                            .flatMap(({ view, source }) => [
                                view.id,
                                source.dataRevision,
                                source.readiness,
                            ]),
                    ],
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
