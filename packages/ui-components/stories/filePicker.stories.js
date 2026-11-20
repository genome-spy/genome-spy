import { html } from "lit";
import "@genome-spy/ui-components/define/filePicker";
import { showSelectedFiles } from "./fileSelection.js";

export default {
    title: "Components/FilePicker",
    component: "gs-file-picker",
    tags: ["autodocs"],
    args: { accept: ".csv,.tsv", multiple: true },
};

export const ChooseFiles = {
    /** @param {{accept: string, multiple: boolean}} args */
    render: ({ accept, multiple }) => html`
        <gs-file-picker
            .accept=${accept}
            ?multiple=${multiple}
            @gs-files-chosen=${showSelectedFiles}
            >Choose datasets</gs-file-picker
        >
        <output style="display: block; margin-block-start: 0.75rem;"></output>
    `,
};
