import { html, LitElement, nothing } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faInfoCircle,
    faQuestionCircle,
    faExpandArrowsAlt,
    faBug,
    faFileImage,
    faEllipsisVertical,
} from "@fortawesome/free-solid-svg-icons";
import { findGenomeScaleResolution } from "./searchField.js";
import { asArray } from "@genome-spy/core/utils/arrayUtils.js";
import bowtie from "@genome-spy/core/img/bowtie.svg";
import { messageBox } from "../utils/ui/modal.js";

import packageJson from "../../package.json" with { type: "json" };

import "./viewSettingsButton.js";
import "./provenanceToolbar.js";
import "./bookmarkButton.js";
import { showDataflowInspectorDialog } from "../dataflowInspector.js";
import showSaveImageDialog from "../saveImageDialog.js";
import { toggleDropdown } from "../utils/ui/dropdown.js";
import { menuItemToTemplate } from "../utils/ui/contextMenu.js";
import { subscribeTo } from "../state/subscribeTo.js";

export default class Toolbar extends LitElement {
    constructor() {
        super();

        /** @type {import("../app.js").default} */
        this.app = undefined;
    }

    static get properties() {
        return {
            app: { type: Object },
        };
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        subscribeTo(
            this.app.store,
            (state) => state.lifecycle.appInitialized,
            () => this.requestUpdate()
        );
    }

    _getToolButtons() {
        const provenance = this.app.provenance;

        /** @type {(import("lit").TemplateResult | string)[]} */
        const elements = [];

        // Check that there's an undoable state
        if (provenance.isEnabled()) {
            elements.push(html`
                <genome-spy-provenance-buttons
                    class="btn-group"
                    .provenance=${provenance}
                ></genome-spy-provenance-buttons>
            `);
        }

        elements.push(
            html`<genome-spy-view-visibility></genome-spy-view-visibility>`
        );

        elements.push(html`
            <genome-spy-bookmark-button></genome-spy-bookmark-button>
        `);

        /**
         * The first entry in the description array is shown as a title in the toolbar
         */

        const description = this.app.rootSpec.description
            ? asArray(this.app.rootSpec.description)
            : [];

        if (description.length > 1) {
            elements.push(html`
                <button
                    class="tool-btn"
                    title="Show a description of the visualization"
                    @click=${() =>
                        messageBox(
                            html`${description
                                .slice(1)
                                .map((line) => html`<p>${line}</p>`)}`,
                            { title: description[0] }
                        )}
                >
                    ${icon(faInfoCircle).node[0]}
                </button>
            `);
        }

        if (description.length > 0) {
            elements.push(html`
                <span class="vis-title">${description[0]}</span>
            `);
        }

        elements.push(html`
            <span class="spacer"></span>

            <div class="dropdown bookmark-dropdown">
                <button
                    class="tool-btn"
                    title="Additional functions"
                    @click=${(/** @type {MouseEvent} */ event) =>
                        toggleDropdown(event)}
                >
                    ${icon(faEllipsisVertical).node[0]}
                </button>
                <ul class="gs-dropdown-menu gs-dropdown-menu-right">
                    ${this.#makeEllipsisTemplate()}
                </ul>
            </div>
        `);

        return elements;
    }

    #makeEllipsisTemplate() {
        /** @type {import("../utils/ui/contextMenu.js").MenuItem[]} */
        const items = [];

        items.push({
            label: "Save PNG",
            icon: faFileImage,
            callback: () => showSaveImageDialog(this.app.genomeSpy),
        });

        if (this.app.options.showInspectorButton) {
            items.push({
                label: "Dataflow Inspector",
                icon: faBug,
                callback: () =>
                    showDataflowInspectorDialog(
                        this.app.genomeSpy.viewRoot.context.dataFlow,
                        {
                            highlightView:
                                this.app.genomeSpy.viewRoot.context
                                    .highlightView,
                        }
                    ),
            });
        }

        if (this.app.appContainer.requestFullscreen) {
            items.push({
                label: "Fullscreen",
                icon: faExpandArrowsAlt,
                callback: () => this.app.toggleFullScreen(),
            });
        }

        items.push({
            label: "About GenomeSpy",
            icon: faInfoCircle,
            callback: () => this.#showAboutDialog(),
        });

        items.push({
            label: "Help",
            icon: faQuestionCircle,
            callback: () =>
                window.open(
                    "https://genomespy.app/docs/sample-collections/analyzing/",
                    "_blank"
                ),
        });

        return items.map(menuItemToTemplate);
    }

    #showAboutDialog() {
        messageBox(
            html` <div style="display: flex; gap: 1em">
                <div style="width: 8em">
                    <img title="GenomeSpy" alt="GenomeSpy" src="${bowtie}" />
                </div>

                <div style="max-width: 28em">
                    <p>
                        ${packageJson.description}<br />
                        Read more about it on
                        <a href="${packageJson.homepage}" target="_blank"
                            >${packageJson.homepage}</a
                        >.
                    </p>
                    <p>
                        Copyright 2025
                        ${packageJson.author?.name ?? "The author"} and
                        contributors.<br />
                        ${packageJson.license} license.
                    </p>
                    <p>
                        Version:
                        <a
                            href="https://github.com/genome-spy/genome-spy/releases/tag/v${packageJson.version}"
                            >v${packageJson.version}</a
                        >
                        ${"commitHash" in packageJson
                            ? `(${packageJson.commitHash})`
                            : nothing}
                    </p>

                    <p style="font-size: 85%">
                        GenomeSpy is developed in
                        <a
                            href="https://www.helsinki.fi/en/researchgroups/systems-biology-of-drug-resistance-in-cancer"
                            target="_blank"
                            >The Systems Biology of Drug Resistance in Cancer</a
                        >
                        group at the
                        <a href="https://www.helsinki.fi/en" target="_blank"
                            >University of Helsinki</a
                        >.
                    </p>

                    <p style="font-size: 85%">
                        This project has received funding from the European
                        Union's Horizon 2020 research and innovation programme
                        under grant agreement No. 965193
                        <a href="https://www.deciderproject.eu/" target="_blank"
                            >DECIDER</a
                        >
                        and No. 847912
                        <a href="https://www.rescuer.uio.no/" target="_blank"
                            >RESCUER</a
                        >, as well as from the Biomedicum Helsinki Foundation,
                        the Sigrid Jusélius Foundation, and the Cancer
                        Foundation Finland.
                    </p>
                </div>
            </div>`,
            { title: "About GenomeSpy App" }
        );
    }

    render() {
        const genomeSpy = this.app.genomeSpy;

        const appInitialized =
            this.app.store.getState().lifecycle.appInitialized;

        return html`
            <nav class="gs-toolbar">
                <a href="https://genomespy.app" target="_blank" class="logo">
                    <img title="GenomeSpy" alt="GenomeSpy" src="${bowtie}" />
                </a>

                ${appInitialized &&
                findGenomeScaleResolution(genomeSpy.viewRoot)
                    ? html`
                          <genome-spy-search-field
                              .app=${this.app}
                          ></genome-spy-search-field>
                      `
                    : nothing}
                ${this._getToolButtons()}
            </nav>
        `;
    }
}

customElements.define("genome-spy-toolbar", Toolbar);
