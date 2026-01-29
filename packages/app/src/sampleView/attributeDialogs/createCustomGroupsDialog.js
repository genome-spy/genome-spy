import { faObjectGroup, faPaste } from "@fortawesome/free-solid-svg-icons";
import { css, html, nothing } from "lit";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import { showMessageDialog } from "../../components/generic/messageDialog.js";
import { makeCustomGroupAccessor } from "../state/groupOperations.js";
import { map } from "lit/directives/map.js";
import { formatSet } from "../state/actionInfo.js";
import { styleMap } from "lit/directives/style-map.js";

const customStyles = css`
    .group-arbitrarily-form {
        span.na {
            color: gray;
            font-style: italic;
            font-size: 90%;
        }

        span.color {
            display: inline-block;
            width: 0.7em;
            height: 1em;
            margin-right: 0.7em;
        }

        div.table {
            color: var(--form-control-color);
            border: var(--form-control-border);
            border-radius: var(--form-control-border-radius);
            overflow-x: auto;
            max-height: 20em;

            padding: 0.375em 0.75em;
            padding-top: 0;

            margin: 0;

            table {
                position: relative;
                border-collapse: collapse;
            }

            td:first-child {
                padding-right: 0.7em;
            }

            th {
                text-align: left;
                background: white;
                background: linear-gradient(
                    rgba(255, 255, 255, 1) 0%,
                    rgba(253, 253, 255, 1) 90%,
                    rgba(255, 255, 255, 0) 100%
                );

                position: sticky;
                top: 0;

                padding-top: 0.55em;
                padding-bottom: 0.375em;
            }
        }

        &.gs-form-group select {
            padding-top: 0.1em;
            padding-bottom: 0.1em;
        }
    }
`;

/**
 * Stratify chosen categories into arbitrary groups. The categories may be
 * nominal / ordinal values or sample identifiers – anything that is not
 * quantitative.
 *
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView
 */
class CreateCustomGroupsDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        attributeInfo: {},
        sampleView: {},
        values: {},
        groups: {},
    };

    static styles = [...super.styles, customStyles];

    constructor() {
        super();
        /** @type {import("../types.js").AttributeInfo} */
        this.attributeInfo = null;
        /** @type {import("../sampleView.js").default} */
        this.sampleView = null;
        /** @type {any[]} */
        this.values = [];
        /** @type {import("../state/payloadTypes.js").CustomGroups} */
        this.groups = {};
    }

    /**
     * @param {Map<string, any>} changed
     */
    willUpdate(changed) {
        if (changed.has("attributeInfo") && this.attributeInfo) {
            this.dialogTitle = html`Create custom groups using
                <em>${this.attributeInfo.name}</em>`;
        }
    }

    /**
     * @param {import("@genome-spy/core/spec/channel.js").Scalar} category
     * @param {string} group
     */
    #setGroup(category, group) {
        for (const [groupName, categories] of Object.entries(this.groups)) {
            if (categories.includes(category)) {
                const index = categories.indexOf(category);
                categories.splice(index, 1);
                if (categories.length === 0) delete this.groups[groupName];
            }
        }

        if (!group) return;

        if (group in this.groups) {
            this.groups[group].push(category);
        } else {
            this.groups[group] = [category];
        }

        this.requestUpdate();
    }

    /**
     * @param {import("@genome-spy/core/spec/channel.js").Scalar} category
     * @param {HTMLInputElement} [opener]
     */
    #newGroupModal(category, opener) {
        let newGroup = "";
        const onChange = (/** @type {Event} */ e) =>
            (newGroup = /** @type {HTMLInputElement} */ (e.target).value);

        showMessageDialog(
            html`<div class="gs-form-group">
                <input
                    type="text"
                    id="group-name"
                    @change=${onChange}
                    @keydown=${onChange}
                />
            </div>`,
            { confirm: true, title: "Group name" }
        ).then((ok) => {
            newGroup = newGroup.trim();
            if (ok && newGroup.length > 0) {
                this.#setGroup(category, newGroup);
            } else if (opener) {
                opener.value = "";
            }
            opener?.focus();
        });
    }

    /**
     * @param {string} types
     */
    #pasteCategoriesModal(types, groupName = "", categoryText = "") {
        const template = html` <p>
                Select a large number of ${types} by pasting them into the text
                area below. The ${types} should be separated by a newline.
            </p>
            <div class="gs-form-group">
                <label for="paste-group-name">Group name</label>
                <input
                    type="text"
                    id="paste-group-name"
                    placeholder="New or existing group name"
                    .value=${groupName}
                    required
                    @change=${(/** @type {Event} */ e) =>
                        (groupName = /** @type {HTMLInputElement} */ (e.target)
                            .value)}
                />

                <label for="paste-group-categories">${capitalize(types)}</label>
                <textarea
                    id="paste-group-categories"
                    placeholder="Type or paste ${types} here, one per line"
                    .value=${categoryText}
                    required
                    rows="8"
                    @change=${(/** @type {Event} */ e) =>
                        (categoryText = /** @type {HTMLInputElement} */ (
                            e.target
                        ).value)}
                ></textarea>
            </div>`;

        const handle = async () => {
            if (groupName.trim().length === 0) {
                await showMessageDialog("Please enter a group name.", {
                    title: "There's a problem",
                    type: "warning",
                });
                return true;
            }

            const lines = categoryText
                .split(/[\r\n]+/g)
                .map((x) => x.trim())
                .filter((x) => x.length > 0);
            const notFound = new Set();
            for (const line of lines) {
                if (!this.values.includes(line)) {
                    notFound.add(line);
                }
            }

            if (notFound.size > 0) {
                await showMessageDialog(
                    html`The following ${types} were not found:
                    ${formatSet(notFound, false)}`,
                    { title: "There's a problem", type: "warning" }
                );
                return true;
            }

            for (const line of lines) {
                this.#setGroup(line, groupName);
            }
        };

        showMessageDialog(template, {
            title: `Paste ${types}`,
            confirm: true,
        }).then(async (ok) => {
            if (ok) {
                const retry = await handle();
                if (retry) {
                    this.#pasteCategoriesModal(types, groupName, categoryText);
                }
            }
        });
    }

    /**
     * @param {import("@genome-spy/core/spec/channel.js").Scalar} category
     * @param {Event} event
     */
    #selectHandler(category, event) {
        const eventTarget = /** @type {HTMLInputElement} */ (event.target);
        const value = eventTarget.value;
        if (value === "__newGroup__")
            this.#newGroupModal(category, eventTarget);
        else this.#setGroup(category, value);
    }

    renderBody() {
        const attributeInfo = this.attributeInfo;
        const type =
            attributeInfo.type == "identifier" ? "Identifier" : "Category";
        const scale = /** @type {any} */ (attributeInfo.scale);
        const categoryToMarker = scale
            ? (/** @type {any} */ value) =>
                  html`<span
                      class="color"
                      style=${styleMap({
                          backgroundColor:
                              scale(value)?.toString() ?? "inherit",
                      })}
                  ></span>`
            : () => nothing;
        const groupAccessor = makeCustomGroupAccessor((x) => x, this.groups);
        const groupNames = Object.keys(this.groups);

        /** @param {import("@genome-spy/core/spec/channel.js").Scalar} category */
        const makeTableRow = (category) => {
            const selectedGroup = groupAccessor(category);
            return html`<tr>
                <td>
                    ${category != null
                        ? html`${categoryToMarker(category)}${category}`
                        : html`<span class="na">NA</span>`}
                </td>
                <td>
                    <select
                        @change=${(/** @type {Event} */ e) =>
                            this.#selectHandler(category, e)}
                        @keydown=${(/** @type {KeyboardEvent} */ e) =>
                            e.stopPropagation()}
                    >
                        <option .selected=${!selectedGroup} value="">
                            - No group -
                        </option>
                        ${map(
                            groupNames,
                            (groupName) =>
                                html`<option
                                    .selected=${groupName === selectedGroup}
                                    value=${groupName}
                                >
                                    ${groupName}
                                </option>`
                        )}
                        <hr />
                        <option value="__newGroup__">Create new group</option>
                    </select>
                </td>
            </tr>`;
        };

        return html`<div class="gs-form-group group-arbitrarily-form">
            <div class="table">
                <table>
                    <tr>
                        <th>${type}</th>
                        <th>Group</th>
                    </tr>
                    ${map(this.values, makeTableRow)}
                </table>
            </div>
        </div>`;
    }

    renderButtons() {
        const types =
            this.attributeInfo.type == "identifier"
                ? "identifiers"
                : "categories";
        return [
            this.makeButton(
                "Paste " + types,
                () => {
                    this.#pasteCategoriesModal(types);
                    return true;
                },
                { iconDef: faPaste }
            ),
            this.makeButton("Cancel", () => this.finish({ ok: false })),
            this.makeButton("Group", () => this.#onGroup(), {
                iconDef: faObjectGroup,
            }),
        ];
    }

    #onGroup() {
        this.sampleView.dispatchAttributeAction(
            this.sampleView.actions.groupCustomCategories({
                attribute: this.attributeInfo.attribute,
                groups: this.groups,
            })
        );
        this.finish({ ok: true });
    }
}

customElements.define(
    "gs-create-custom-groups-dialog",
    CreateCustomGroupsDialog
);

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView
 */
export function showCreateCustomGroupsDialog(attributeInfo, sampleView) {
    return showDialog(
        "gs-create-custom-groups-dialog",
        (/** @type {any} */ el) => {
            el.attributeInfo = attributeInfo;
            el.sampleView = sampleView;
            el.values = extractValues(
                attributeInfo,
                sampleView.leafSamples,
                sampleView.sampleHierarchy
            );
            el.groups = {};
        }
    );
}

/**
 * N.B. This is copy-paste from advanced filter. TODO: dedupe
 *
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {string[]} samples
 * @param {import("../state/sampleSlice.js").SampleHierarchy} sampleHierarchy
 */
function extractValues(attributeInfo, samples, sampleHierarchy) {
    const a = attributeInfo.accessor;
    const asSet = new Set(
        /** @type {import("@genome-spy/core/spec/channel.js").Scalar[]} */ (
            samples.map((sampleId) => a(sampleId, sampleHierarchy))
        )
    );
    return Array.from(asSet).sort();
}

/**
 * @param {string} s
 */
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
