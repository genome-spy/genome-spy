import { html } from "lit";
import "./uploadDropZone.js";

export default {
    title: "Components/UploadDropZone",
    tags: ["autodocs"],
    args: {
        accept: "",
        multiple: false,
        dropText: "Drop a file here or",
        width: 500,
    },
    argTypes: {
        accept: { control: { type: "text" } },
        multiple: { control: { type: "boolean" } },
        dropText: { control: { type: "text" } },
        width: { control: { type: "number", min: 100, max: 1200 } },
    },
};

// A tiny demo wrapper element that renders the drop zone and shows chosen files
if (!customElements.get("gs-upload-drop-zone-demo")) {
    class UploadDropZoneDemo extends HTMLElement {
        constructor() {
            super();
            this._root = this.attachShadow({ mode: "open" });
            this._filesList = document.createElement("div");
        }

        static get observedAttributes() {
            return ["accept", "multiple", "drop-text", "style"];
        }

        attributeChangedCallback() {
            this._render();
        }

        connectedCallback() {
            this._render();
        }

        _render() {
            const accept = this.getAttribute("accept") || "";
            const multiple = this.hasAttribute("multiple");
            const dropText =
                this.getAttribute("drop-text") || "Drop a file here or";
            const width = this.getAttribute("data-width") || "500";
            const height = this.getAttribute("data-height") || "160";

            this._root.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:0.5rem;">
                    <gs-upload-drop-zone
                        style="width: ${width}px; height: ${height}px; display:block;"
                        ${accept ? `accept="${accept}"` : ""}
                        ${multiple ? `multiple` : ""}
                    ></gs-upload-drop-zone>
                    <div id="files" style="font-family: system-ui, sans-serif; font-size: 0.9rem;
                        color: #333; padding: 0.5rem; border: 1px solid #eee; border-radius: 4px; background:#fafafa;">
                        <em>No files chosen yet</em>
                    </div>
                </div>
            `;

            const dropZone =
                /** @type {import("./uploadDropZone.js").default} */ (
                    this._root.querySelector("gs-upload-drop-zone")
                );
            const out = this._root.querySelector("#files");

            dropZone.dropText = dropText;
            dropZone.accept = accept;
            dropZone.multiple = multiple;

            // ensure we don't double-register listeners
            dropZone.removeEventListener(
                "gs-files-chosen",
                this._onFilesChosen
            );
            this._onFilesChosen = (/** @type {CustomEvent} */ e) => {
                const files = e.detail.files;
                const names = [];
                for (let i = 0; i < files.length; i++)
                    names.push(files[i].name);
                out.innerHTML = `<strong>Chosen files</strong>: <span>${names.join(", ")}</span>`;
            };
            dropZone.addEventListener("gs-files-chosen", this._onFilesChosen);
        }
    }

    customElements.define("gs-upload-drop-zone-demo", UploadDropZoneDemo);
}

export const Basic = {
    render: (/** @type {any} */ args) => html`
        <gs-upload-drop-zone-demo
            accept=${args.accept}
            ?multiple=${args.multiple}
            drop-text=${args.dropText}
            data-width=${args.width}
            data-height=${args.height}
        ></gs-upload-drop-zone-demo>
    `,
};

export const AcceptCsv = {
    render: (/** @type {any} */ args) => html`
        <gs-upload-drop-zone-demo
            accept=".csv,text/csv"
            ?multiple=${false}
            drop-text="Drop CSV here or"
            data-width=${args.width}
            data-height=${args.height}
        ></gs-upload-drop-zone-demo>
    `,
};
