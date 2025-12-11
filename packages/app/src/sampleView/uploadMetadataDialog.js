import { read } from "vega-loader";
import { html } from "lit";
import { messageBox } from "../utils/ui/modal.js";
import { createRef, ref } from "lit/directives/ref.js";

export async function showUploadMetadataDialog(sampleView) {
    /** @type {import("lit/directives/ref.js").Ref<HTMLInputElement>} */
    const fileRef = createRef();

    const template = html`<p>Hello</p>
        <input type="file" accept=".csv,.tsv" ${ref(fileRef)} /> `;

    if (await messageBox(template)) {
        const fileInput = fileRef.value;
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const textContent = await readFileAsync(file);

            const data = read(textContent, {
                type: inferFileType(textContent, file.name),
                parse: "auto",
            });

            console.log(data);
        }
    }
}

// --- copypasted from playground ---

/**
 * https://simon-schraeder.de/posts/filereader-async/
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsync(file) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onload = () => resolve(/** @type {string} */ (reader.result));
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

/**
 * @param {string} contents
 * @param {string} name
 */
function inferFileType(contents, name) {
    if (/\.json$/.test(name)) {
        return "json";
    } else {
        // In bioinformatics, csv files are often actually tsv files
        return contents.indexOf("\t") >= 0 ? "tsv" : "csv";
    }
}
