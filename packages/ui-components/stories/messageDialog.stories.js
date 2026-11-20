import { html } from "lit";
import { showMessageDialog } from "@genome-spy/ui-components/messageDialog";

export default {
    title: "Components/MessageDialog",
    component: "gs-message-dialog",
    tags: ["autodocs"],
    args: {
        title: "Publish dataset",
        message: "Publish the preview so collaborators can open it?",
        type: "info",
        confirm: true,
    },
    argTypes: {
        type: { control: "select", options: ["info", "warning", "error"] },
    },
};

export const Programmatic = {
    /**
     * @param {import("@genome-spy/ui-components/messageDialog").MessageDialogOptions &
     *     { message: string }} args
     */
    render: ({ message, title, type, confirm }) => html`
        <div>
            <button
                type="button"
                @click=${async (/** @type {MouseEvent} */ event) => {
                    const button = /** @type {HTMLButtonElement} */ (
                        event.currentTarget
                    );
                    const accepted = await showMessageDialog(message, {
                        title,
                        type,
                        confirm,
                        mount: /** @type {HTMLElement} */ (
                            button.parentElement
                        ),
                    });
                    const output = /** @type {HTMLOutputElement} */ (
                        button.nextElementSibling
                    );
                    output.value = confirm
                        ? accepted
                            ? "Confirmed"
                            : "Canceled"
                        : "Closed";
                }}
            >
                Open message dialog
            </button>
            <output
                style="display: block; margin-block-start: 0.75rem;"
            ></output>
        </div>
    `,
};
