import { html, nothing } from "lit";
import BaseDialog from "../generic/baseDialog.js";
import bowtie from "@genome-spy/core/img/bowtie.svg";
import { renderVersionLink, packageJson } from "../../utils/version.js";

function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export default class AboutDialog extends BaseDialog {
    constructor() {
        super();
        this.dialogTitle = "About GenomeSpy";
    }

    renderBody() {
        return html` <div style="display: flex; gap: 1em">
            <div style="width: 8em">
                <img title="GenomeSpy" alt="GenomeSpy" src="${bowtie}" />
            </div>

            <div style="max-width: 28em">
                <p>
                    ${escapeHtml(packageJson.description)}<br />
                    Read more about it on
                    <a href="${escapeHtml(packageJson.homepage)}" target="_blank" rel="noopener noreferrer"
                        >${escapeHtml(packageJson.homepage)}</a
                    >.
                </p>
                <p>
                    Copyright 2026 ${escapeHtml(packageJson.author?.name ?? "The author")}
                    and contributors.<br />
                    ${escapeHtml(packageJson.license)} license.
                </p>
                <p>
                    Version: ${renderVersionLink(packageJson.version)}
                    ${"commitHash" in packageJson
                        ? `(${escapeHtml(packageJson.commitHash)})`
                        : nothing}
                </p>

                <p style="font-size: 85%">
                    GenomeSpy is developed in
                    <a
                        href="https://www.helsinki.fi/en/researchgroups/systems-biology-of-drug-resistance-in-cancer"
                        target="_blank" rel="noopener noreferrer"
                        >The Systems Biology of Drug Resistance in Cancer</a
                    >
                    group at the
                    <a href="https://www.helsinki.fi/en" target="_blank" rel="noopener noreferrer"
                        >University of Helsinki</a
                    >.
                </p>

                <p style="font-size: 85%">
                    This project has received funding from the European Union's
                    Horizon 2020 research and innovation programme under grant
                    agreement No. 965193
                    <a href="https://www.deciderproject.eu/" target="_blank" rel="noopener noreferrer"
                        >DECIDER</a
                    >
                    and No. 847912
                    <a href="https://www.rescuer.uio.no/" target="_blank" rel="noopener noreferrer"
                        >RESCUER</a
                    >, as well as from the Biomedicum Helsinki Foundation, the
                    Sigrid Jusélius Foundation, and the Cancer Foundation
                    Finland.
                </p>
            </div>
        </div>`;
    }
}

customElements.define("gs-about-dialog", AboutDialog);
