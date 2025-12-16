import { html, LitElement, nothing } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faInfoCircle,
    faQuestionCircle,
    faExpandArrowsAlt,
    faBug,
    faFileImage,
    faEllipsisVertical,
    faFileUpload,
} from "@fortawesome/free-solid-svg-icons";
import { findGenomeScaleResolution } from "./searchField.js";
import { asArray } from "@genome-spy/core/utils/arrayUtils.js";
import bowtie from "@genome-spy/core/img/bowtie.svg";
import "./viewSettingsButton.js";
import "./provenanceToolbar.js";
import "./bookmarkButton.js";
import { showDataflowInspectorDialog } from "./dialogs/dataflowInspectorDialog.js";
import { toggleDropdown } from "../utils/ui/dropdown.js";
import { menuItemToTemplate } from "../utils/ui/contextMenu.js";
import { subscribeTo } from "../state/subscribeTo.js";
import { showDialog } from "./dialogs/baseDialog.js";
import "./dialogs/aboutDialog.js";
import "./dialogs/saveImageDialog.js";
import { showMessageDialog } from "./dialogs/messageDialog.js";
import { showUploadMetadataDialog } from "../sampleView/uploadMetadataDialog.js";

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

            elements.push(html`
                <button
                    class="tool-btn"
                    title="Upload metadata"
                    @click=${() =>
                        showUploadMetadataDialog(this.app.getSampleView())}
                >
                    ${icon(faFileUpload).node[0]}
                </button>
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
                        showMessageDialog(
                            html`${description
                                .slice(1)
                                .map((line) => html`<p>${line}</p>`)}`,
                            { title: description[0], type: "info" }
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
            callback: () =>
                showDialog(
                    "gs-save-image-dialog",
                    (/** @type {any} */ saveImageDialog) => {
                        saveImageDialog.genomeSpy = this.app.genomeSpy;
                    }
                ),
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
        showDialog("gs-about-dialog");
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
