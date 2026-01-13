import { html } from "lit";
import "./metadataHierarchyConfigurator.js";

export default {
    title: "Sample View/Metadata Hierarchy Configurator",
    tags: ["autodocs"],
};

const csv = `sample,group1.foo,group1.bar,group1.baz,group2.qwe,group2.asd,group3.sub1.wer,group2.sub1.ert,group2.blah
sample1,1.2,0.4,0.1,xyzzy,iddqd,4.2,246,23
sample2,1.05,0.41,0.097,plugh,iddqd,5.63,233,21
sample3,1.36,0.39,0.102,xyzzy,idkfa,3.12,260,24
sample4,0.88,0.44,0.088,plover,iddqd,6.91,205,22
sample5,1.62,0.38,0.104,frobozz,godmode,2.44,278,23
sample6,1.18,0.40,0.099,xyzzy,idkfa,4.85,252,25
sample7,1.29,0.37,0.095,plugh,iddqd,7.22,241,20
sample8,1.11,0.42,0.101,frobozz,iddqd,3.76,262,23
sample9,1.47,0.40,0.093,plover,godmode,5.14,226,24
sample10,0.96,0.43,0.106,xyzzy,iddqd,1.98,289,22
sample11,1.24,0.39,0.098,plugh,idkfa,4.33,247,23`;

/**
 * Parse a simple CSV string into records.
 * @param {string} text
 * @returns {Array<Record<string, string|number>>}
 */
function parseCsv(text) {
    /** @type {string[]} */
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    /** @type {string[]} */
    const headers = lines[0].split(",").map((h) => h.trim());
    /** @type {Array<string[]>} */
    const rows = lines.slice(1).map((ln) => ln.split(",").map((c) => c.trim()));
    return rows.map((cells) => {
        /** @type {Record<string, string|number>} */
        const obj = {};
        for (let i = 0; i < headers.length; i++) {
            /** @type {string} */
            const v = cells[i] ?? "";
            // convert numeric-like cells to numbers
            if (/^-?\d+(?:\.\d+)?$/.test(v)) {
                obj[headers[i]] = Number(v);
            } else {
                obj[headers[i]] = v;
            }
        }
        return obj;
    });
}

/** @type {Array<Record<string, string|number>>} */
const records = parseCsv(csv);

export const Basic = {
    render: () => html`
        <div style="max-width:900px">
            <gs-metadata-hierarchy-configurator
                .metadataRecords=${records}
                @metadata-config-change=${(
                    /** @type {CustomEvent} */ event
                ) => {
                    const output = document.getElementById("config-output");
                    const detail =
                        /** @type {import("./metadataUtils.js").MetadataConfig} */ (
                            event.detail
                        );
                    const payload = {
                        separator: detail.separator,
                        addUnderGroup: detail.addUnderGroup,
                        scales: Object.fromEntries(
                            Array.from(detail.scales.entries())
                        ),
                        metadataNodeTypes: Object.fromEntries(
                            Array.from(detail.metadataNodeTypes.entries())
                        ),
                        invalidInheritLeafNodes:
                            detail.invalidInheritLeafNodes ?? [],
                    };
                    output.textContent = JSON.stringify(payload, null, 2);
                }}
            ></gs-metadata-hierarchy-configurator>
            <div style="margin-top:1em;">
                <label>Emitted payload</label>
                <pre
                    id="config-output"
                    style="padding:0.75em;border:1px solid #ddd;background:#f8f8f8;border-radius:6px;white-space:pre-wrap;"
                ></pre>
            </div>
        </div>
    `,
};
