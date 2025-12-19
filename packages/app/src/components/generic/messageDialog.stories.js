import { html } from "lit";
import "./messageDialog.js";
import { showMessageDialog } from "./messageDialog.js";

export default {
    title: "Components/MessageDialog",
    tags: ["autodocs"],
    args: {
        title: "Notice",
        message: "This is an informational message.",
        type: "info",
        confirm: false,
    },
    argTypes: {
        title: { control: "text" },
        message: { control: "text" },
        type: {
            control: { type: "select", options: ["info", "warning", "error"] },
        },
        confirm: { control: "boolean" },
    },
};

export const Inline = {
    render: (args) => html`
        <gs-message-dialog
            .dialogTitle=${args.title}
            .message=${args.message}
            .type=${args.type}
            .confirm=${args.confirm}
        ></gs-message-dialog>
    `,
};

// Programmatic demo: buttons that call `showMessageDialog` and display the result
if (!customElements.get("gs-message-dialog-demo")) {
    class MessageDialogDemo extends HTMLElement {
        constructor() {
            super();
            this._root = this.attachShadow({ mode: "open" });
            this._result = this._root.ownerDocument.createElement("div");
        }

        connectedCallback() {
            this._render();
        }

        _render() {
            this._root.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:0.75rem;font-family:system-ui, sans-serif;">
                    <div style="display:flex;gap:0.5rem;">
                        <button id="info">Show Info</button>
                        <button id="warn">Show Warning</button>
                        <button id="err">Show Error</button>
                        <button id="confirm">Show Confirm</button>
                    </div>
                    <div id="out" style="padding:0.5rem;border:1px solid #eee;background:#fafafa;border-radius:4px;min-height:2rem;">No result yet</div>
                </div>
            `;

            const out = this._root.querySelector("#out");

            this._root
                .querySelector("#info")
                .addEventListener("click", async () => {
                    const res = await showMessageDialog(
                        "This is an info message.",
                        { title: "Info", type: "info" }
                    );
                    out.textContent = `Result: ${JSON.stringify(res)}`;
                });

            this._root
                .querySelector("#warn")
                .addEventListener("click", async () => {
                    const res = await showMessageDialog(
                        "Be careful! This is a warning.",
                        { title: "Warning", type: "warning" }
                    );
                    out.textContent = `Result: ${JSON.stringify(res)}`;
                });

            this._root
                .querySelector("#err")
                .addEventListener("click", async () => {
                    const res = await showMessageDialog("An error occurred.", {
                        title: "Error",
                        type: "error",
                    });
                    out.textContent = `Result: ${JSON.stringify(res)}`;
                });

            this._root
                .querySelector("#confirm")
                .addEventListener("click", async () => {
                    const res = await showMessageDialog(
                        "Do you want to proceed?",
                        { title: "Confirm", type: "warning", confirm: true }
                    );
                    out.textContent = `Result: ${JSON.stringify(res)}`;
                });
        }
    }

    customElements.define("gs-message-dialog-demo", MessageDialogDemo);
}

export const Programmatic = {
    render: () => html`<gs-message-dialog-demo></gs-message-dialog-demo>`,
};
