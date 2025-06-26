import { html, LitElement, nothing } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { messageBox } from "./utils/ui/modal.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faDownload,
    faInfoCircle,
    faXmark,
} from "@fortawesome/free-solid-svg-icons";

/** @param {number} num */
function roundToEven(num) {
    return Math.round(num / 2) * 2;
}

/**
 *
 * @param {import("@genome-spy/core/genomeSpy.js").default} genomeSpy
 */
export default function showSaveImageDialog(genomeSpy) {
    // TODO: Make canvas size available through the official API
    let { width, height } = genomeSpy._glHelper.getLogicalCanvasSize();

    // Ensure that 0.5 scale factors behave nicely
    width = roundToEven(width);
    height = roundToEven(height);

    /** @type {import("lit/directives/ref.js").Ref<ImageSettingsForm>} */
    const formRef = createRef();

    const template = html`
        <div class="gs-alert info">
            ${icon(faInfoCircle).node[0]}
            <span>
                <span
                    style="float: right; cursor: pointer;"
                    @click=${(/** @type {UIEvent} */ event) => {
                        /** @type {HTMLElement} */ (
                            /** @type {HTMLElement} */ (event.target).closest(
                                ".gs-alert"
                            )
                        ).style.display = "none";
                    }}
                    >${icon(faXmark).node[0]}</span
                >
                To create publication-quality images:
                <ol>
                    <li>
                        Adjust the GenomeSpy window so the visualization and
                        labels appear as you want them.
                    </li>
                    <li>
                        Use the scale factor slider below to increase
                        resolution.
                    </li>
                    <li>
                        Note: Smaller image dimensions with a higher scale
                        factor will produce relatively larger and clearer labels
                        and elements.
                    </li>
                </ol>
            </span>
        </div>

        <genome-spy-image-settings-form
            ${ref(formRef)}
            .logicalWidth=${width}
            .logicalHeight=${height}
        ></genome-spy-image-settings-form>
    `;

    messageBox(template, {
        title: "Save as PNG",
        okLabel: html`${icon(faDownload).node[0]} Save`,
        cancelButton: true,
    }).then((result) => {
        if (!result) {
            return;
        }

        const form = formRef.value;
        const dataURL = genomeSpy.exportCanvas(
            width,
            height,
            form.devicePixelRatio,
            form.transparentBackground ? null : form.backgroundColor
        );
        const link = document.createElement("a");
        link.href = dataURL;
        link.download = "genomespy-visualization.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

/**
 * Utility to cast event.target to HTMLInputElement
 * @param {Event} event
 * @returns {HTMLInputElement}
 */
function getInputElement(event) {
    return /** @type {HTMLInputElement} */ (event.target);
}

class ImageSettingsForm extends LitElement {
    static properties = {
        logicalWidth: { type: Number },
        logicalHeight: { type: Number },
        devicePixelRatio: { type: Number },
        imageWidth: { type: Number },
        imageHeight: { type: Number },
        transparentBackground: { type: Boolean },
        backgroundColor: { type: String },
    };

    constructor() {
        super();
        this.devicePixelRatio = 2;
        this.logicalWidth = 800; // Default logical width
        this.logicalHeight = 600; // Default logical height
        this.imageWidth = 0;
        this.imageHeight = 0;
        this.transparentBackground = false; // Default to opaque background
        this.backgroundColor = "#ffffff"; // Default background color
    }

    connectedCallback() {
        super.connectedCallback();
        this.#updateImageDimensions();
    }

    firstUpdated() {
        /** @type {HTMLElement} */ (
            this.renderRoot.querySelector("#pngDevicePixelRatio")
        ).focus();
    }

    createRenderRoot() {
        return this;
    }

    render() {
        return html`
            <div class="gs-form-group">
                <label for="canvasDimensions">Visualization dimensions</label>
                <input
                    type="text"
                    id="canvasDimensions"
                    .value=${`${this.logicalWidth} x ${this.logicalHeight}`}
                    disabled
                />
            </div>

            <div class="gs-form-group">
                <label for="pngDevicePixelRatio">Scale factor</label>
                <div style="display: flex">
                    <input
                        type="range"
                        id="pngDevicePixelRatio"
                        min="0.5"
                        max="4"
                        step="0.5"
                        .value=${"" + this.devicePixelRatio}
                        @input=${this.#updateDPR}
                    />
                    <span style="width: 2em; margin-left: 0.5em"
                        >${this.devicePixelRatio}</span
                    >
                </div>
            </div>

            <div class="gs-form-group">
                <label for="pngDimensions">Image dimensions</label>
                <input
                    type="text"
                    id="pngDimensions"
                    .value=${`${this.imageWidth} x ${this.imageHeight}`}
                    disabled
                />
            </div>

            <div class="gs-form-group">
                <div class="label">Background</div>
                <div style="display: flex; align-items: center">
                    <label class="checkbox" style="margin-bottom: 0"
                        ><input
                            type="checkbox"
                            ?checked=${this.transparentBackground}
                            @change=${(/** @type {Event} */ event) => {
                                this.transparentBackground =
                                    getInputElement(event).checked;
                            }}
                        />
                        Transparent</label
                    >
                    ${!this.transparentBackground
                        ? html`<input
                              type="color"
                              id="pngBackground"
                              style="margin-left: 1em"
                              .value=${this.backgroundColor}
                              @change=${(/** @type {Event} */ event) => {
                                  this.backgroundColor =
                                      getInputElement(event).value;
                              }}
                          />`
                        : nothing}
                </div>
            </div>
        `;
    }

    /**
     *
     * @param {InputEvent} event
     */
    #updateDPR(event) {
        this.devicePixelRatio = getInputElement(event).valueAsNumber;
        this.#updateImageDimensions();
    }

    #updateImageDimensions() {
        this.imageWidth = Math.round(this.logicalWidth * this.devicePixelRatio);
        this.imageHeight = Math.round(
            this.logicalHeight * this.devicePixelRatio
        );
    }
}

customElements.define("genome-spy-image-settings-form", ImageSettingsForm);
