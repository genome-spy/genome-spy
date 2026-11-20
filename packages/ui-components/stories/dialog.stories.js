import { html } from "lit";
import BaseDialog, { showDialog } from "@genome-spy/ui-components/dialog";
import DialogWizardController from "@genome-spy/ui-components/dialogWizardController";
import { FormController } from "@genome-spy/ui-components/formController";
import { formField } from "@genome-spy/ui-components/formField";

class SetupDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        _page: { state: true },
        name: { state: true },
    };

    constructor() {
        super();
        this.dialogTitle = "Set up a dataset";
        this._page = 0;
        this.name = "";
        this.form = new FormController(this);
        this.form.defineField("name", {
            valueKey: "name",
            validate: () => (this.name.trim() ? null : "Enter a dataset name."),
        });
        this.wizard = new DialogWizardController(this, [
            {
                render: () => html`
                    <div class="gs-form-group">
                        <label for="dataset-name">Dataset name</label>
                        <input
                            id="dataset-name"
                            type="text"
                            autofocus
                            ${formField(this.form, "name")}
                        />
                        ${this.form.feedback("name")}
                    </div>
                `,
                onAdvance: () => !this.form.validateAll(),
            },
            {
                render: () =>
                    html`<p>
                        Use <strong>${this.name}</strong> as the dataset name.
                    </p>`,
            },
        ]);
    }

    renderBody() {
        return this.wizard.currentPage.render();
    }

    renderButtons() {
        return [
            this.makeCloseButton("Cancel"),
            ...(this.wizard.isFirstPage
                ? []
                : [this.makeButton("Back", () => this.wizard.advance(-1))]),
            this.makeButton(
                this.wizard.isLastPage ? "Finish" : "Next",
                () => {
                    if (this.wizard.isLastPage) {
                        this.finish({ ok: true, data: this.name });
                        return false;
                    }

                    this.wizard.advance(1);
                    return true;
                },
                { isPrimary: true }
            ),
        ];
    }
}

customElements.define("gs-story-setup-dialog", SetupDialog);

export default {
    title: "Components/Dialog",
    tags: ["autodocs"],
    parameters: {
        docs: {
            description: {
                component:
                    "Extend `BaseDialog` and register your custom element. " +
                    "Render fields in `renderBody()` and build footer actions in `renderButtons()`. " +
                    "Call `finish({ ok, data })` to resolve the caller's result. " +
                    "Use `showDialog(tagName, configure, { mount })` to open it under a themed container.",
            },
        },
    },
};

/** @param {MouseEvent} event */
async function openWizard(event) {
    const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
    const result = await showDialog("gs-story-setup-dialog", undefined, {
        mount: /** @type {HTMLElement} */ (button.parentElement),
    });
    const output = /** @type {HTMLOutputElement} */ (button.nextElementSibling);
    output.textContent = result.ok
        ? "Dataset name: " + result.data
        : "Canceled";
}

export const FormWizard = {
    render: () => html`
        <div>
            <button type="button" @click=${openWizard}>
                Open setup dialog
            </button>
            <output
                style="display: block; margin-block-start: 0.75rem;"
            ></output>
        </div>
    `,
};
