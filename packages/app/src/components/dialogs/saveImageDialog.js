import { html, nothing } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faDownload,
    faInfoCircle,
    faXmark,
} from "@fortawesome/free-solid-svg-icons";
import BaseDialog from "../generic/baseDialog.js";

const instructions = html`
    <div class="gs-alert info" style="max-width: 500px">
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
                    Adjust the GenomeSpy window so the visualization and labels
                    appear as you want them.
                </li>
                <li>
                    Use the scale factor slider below to increase resolution.
                </li>
                <li>
                    Note: Smaller image dimensions with a higher scale factor
                    will produce relatively larger and clearer labels and
                    elements.
                </li>
            </ol>
        </span>
    </div>
`;

export default class SaveImageDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        genomeSpy: { type: Object },
        logicalWidth: { type: Number },
        logicalHeight: { type: Number },
        devicePixelRatio: { type: Number },
        imageWidth: { type: Number },
        imageHeight: { type: Number },
        transparentBackground: { type: Boolean },
        backgroundColor: { type: String },
    };

    static styles = [...super.styles];

    constructor() {
        super();

        /** @type {import("@genome-spy/core/genomeSpy.js").default} */
        this.genomeSpy = null;

        this.dialogTitle = "Save Visualization as PNG Image";

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

        const { width, height } = this.genomeSpy.getLogicalCanvasSize();

        this.logicalWidth = roundToEven(width);
        this.logicalHeight = roundToEven(height);
    }

    /**
     * @param {Map<string, any>} changed
     */
    willUpdate(changed) {
        if (
            ["logicalWidth", "logicalHeight", "devicePixelRatio"].some((prop) =>
                changed.has(prop)
            )
        ) {
            const dpr = this.devicePixelRatio;
            this.imageWidth = Math.round(this.logicalWidth * dpr);
            this.imageHeight = Math.round(this.logicalHeight * dpr);
        }
    }

    renderBody() {
        return html`
            ${instructions}

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
                        @input=${createInputListener((input) => {
                            this.devicePixelRatio = input.valueAsNumber;
                        })}
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
                            @change=${createInputListener((input) => {
                                this.transparentBackground = input.checked;
                            })}
                        />
                        Transparent</label
                    >
                    ${!this.transparentBackground
                        ? html`<input
                              type="color"
                              id="pngBackground"
                              style="margin-left: 1em"
                              .value=${this.backgroundColor}
                              @change=${createInputListener((input) => {
                                  this.backgroundColor = input.value;
                              })}
                          />`
                        : nothing}
                </div>
            </div>
        `;
    }

    renderButtons() {
        return [
            this.makeCloseButton("Cancel"),
            this.makeButton(
                "Save PNG",
                () => {
                    this.#downloadImage();
                    this.finish({ ok: true });
                    this.triggerClose();
                },
                { iconDef: faDownload, isPrimary: true }
            ),
        ];
    }

    #downloadImage() {
        const dataURL = this.genomeSpy.exportCanvas(
            this.logicalWidth,
            this.logicalHeight,
            this.devicePixelRatio,
            this.transparentBackground ? null : this.backgroundColor
        );
        const link = document.createElement("a");
        link.href = dataURL;
        link.download = "genomespy-visualization.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

customElements.define("gs-save-image-dialog", SaveImageDialog);

/** @param {number} num */
function roundToEven(num) {
    return Math.round(num / 2) * 2;
}

/**
 * @param {Event} event
 * @returns {HTMLInputElement}
 */
export function getInputElement(event) {
    return /** @type {HTMLInputElement} */ (event.target);
}

/**
 * @param {(input: HTMLInputElement, event: UIEvent) => void} callback
 */
export function createInputListener(callback) {
    return (/** @type {UIEvent} */ event) => {
        const input = getInputElement(event);
        callback(input, event);
    };
}
