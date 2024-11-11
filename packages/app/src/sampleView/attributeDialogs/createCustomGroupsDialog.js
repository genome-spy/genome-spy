import { icon } from "@fortawesome/fontawesome-svg-core";
import { faObjectGroup, faPaste } from "@fortawesome/free-solid-svg-icons";
import { html, nothing, render } from "lit";
import { createModal, messageBox } from "../../utils/ui/modal.js";
import { makeCustomGroupAccessor } from "../groupOperations.js";
import { map } from "lit/directives/map.js";
import { formatSet } from "../sampleSlice.js";
import { styleMap } from "lit/directives/style-map.js";

/**
 * Stratify chosen categories into arbitrary groups. The categories may be
 * nominal / ordinal values or sample identifiers – anything that is not
 * quantitative.
 *
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView TODO: Figure out a better way to pass typings
 */
export default function createCustomGroupsDialog(attributeInfo, sampleView) {
    /**
     * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
     */
    const [type, types] =
        attributeInfo.type == "identifier"
            ? ["Identifier", "identifiers"]
            : ["Category", "categories"];

    /** */
    const dispatch = sampleView.provenance.storeHelper.getDispatcher();

    const scale =
        /** @type {import("d3-scale").ScaleOrdinal<Scalar, Scalar>} */ (
            attributeInfo.scale
        );

    const categoryToMarker = scale
        ? (/** @type {Scalar} */ value) =>
              html`<span
                  class="color"
                  style=${styleMap({
                      backgroundColor: scale(value)?.toString() ?? "inherit",
                  })}
              ></span>`
        : () => nothing;

    const values = new Set(
        extractValues(
            attributeInfo,
            sampleView.leafSamples,
            sampleView.sampleHierarchy
        )
    );

    /** @type {import("../payloadTypes.js").CustomGroups} */
    const groups = {};

    const setGroup = (
        /** @type {Scalar} */ category,
        /** @type {string} */ group
    ) => {
        // TODO: Using Set instead of array would be cleaner
        for (const [groupName, categories] of Object.entries(groups)) {
            if (categories.includes(category)) {
                const index = categories.indexOf(category);
                categories.splice(index, 1);
                if (categories.length === 0) {
                    delete groups[groupName];
                }
            }
        }

        if (!group) {
            return;
        }

        if (group in groups) {
            groups[group].push(category);
        } else {
            groups[group] = [category];
        }
    };

    const modal = createModal();

    const templateTitle = html`
        <div class="modal-title">
            Create custom groups using <em>${attributeInfo.name}</em>
        </div>
    `;

    const dispatchAndClose = (/** @type {boolean} */ remove) => {
        dispatch(
            sampleView.actions.groupCustomCategories({
                attribute: attributeInfo.attribute,
                groups,
            })
        );
        modal.close();
    };

    const templateButtons = () =>
        html` <div class="modal-buttons">
            <button class="btn" @click=${() => pasteCategoriesModal()}>
                ${icon(faPaste).node[0]} Paste ${types}
            </button>

            <div style="flex-grow: 1"></div>

            <button class="btn btn-cancel" @click=${() => modal.close()}>
                Cancel
            </button>

            <button
                class="btn btn-primary"
                @click=${() => dispatchAndClose(false)}
            >
                ${icon(faObjectGroup).node[0]} Group
            </button>
        </div>`;

    /**
     * @param {Scalar} category
     * @param {HTMLElement} [opener]
     */
    function newGroupModal(category, opener) {
        let newGroup = "";

        const onChange = (/** @type {UIEvent} */ event) => {
            newGroup = /** @type {HTMLInputElement} */ (event.target).value;
        };

        messageBox(
            html` <div class="gs-form-group">
                <label for="group-name">Group name</label>
                <input
                    type="text"
                    id="group-name"
                    @change=${onChange}
                    @keydown=${onChange}
                />
            </div>`,
            { cancelButton: true }
        ).then((ok) => {
            newGroup = newGroup.trim();
            if (ok && newGroup.length > 0) {
                // Add the chosen category to the new group
                setGroup(category, newGroup);
                updateHtml();
                opener?.focus();
            }
        });
    }

    function pasteCategoriesModal() {
        let groupName = "";
        let categoryText = "";

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
                    @change=${(/** @type {UIEvent}*/ event) => {
                        groupName = /** @type {HTMLInputElement} */ (
                            event.target
                        ).value;
                    }}
                />
                <label for="paste-group-categories">${capitalize(types)}</label>
                <textarea
                    id="paste-group-categories"
                    placeholder="Type or paste ${types} here, one per line"
                    rows="8"
                    @change=${(/** @type {UIEvent}*/ event) => {
                        categoryText = /** @type {HTMLInputElement} */ (
                            event.target
                        ).value;
                    }}
                ></textarea>
            </div>`;

        messageBox(template, {
            cancelButton: true,
            title: `Paste ${types}`,
        }).then((ok) => {
            if (!ok) {
                return;
            }

            // TODO: Complain if the group name is empty

            const lines = categoryText
                .split(/[\r\n]+/g)
                .map((x) => x.trim())
                .filter((x) => x.length > 0);

            /** @type {Set<string>} */
            const notFound = new Set();

            for (const line of lines) {
                if (!values.has(line)) {
                    notFound.add(line);
                } else {
                    setGroup(line, groupName);
                }
            }

            updateHtml();

            if (notFound.size > 0) {
                messageBox(
                    html`<p>
                        The following ${types} were not found:
                        ${formatSet(notFound, false)}
                    </p>`
                );
            }
        });
    }

    /**
     * @param {Scalar} category
     * @param {UIEvent} event
     */
    function selectHandler(category, event) {
        const eventTarget = /** @type {HTMLInputElement} */ (event.target);
        const value = eventTarget.value;
        if (value === "__newGroup__") {
            newGroupModal(category, eventTarget);
        } else {
            setGroup(category, value);
        }
    }

    function updateHtml() {
        const groupAccessor = makeCustomGroupAccessor((x) => x, groups);
        const groupNames = Object.keys(groups);

        /**
         * @param {Scalar} category
         */
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
                        @change=${(/** @type {UIEvent}*/ event) =>
                            selectHandler(category, event)}
                        @keydown=${(/** @type {KeyboardEvent} */ event) => {
                            // Prevent the modal from closing accidentally
                            event.stopPropagation();
                        }}
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

        const template = html`<div class="gs-form-group group-arbitrarily-form">
            <div class="table">
                <table>
                    <tr>
                        <th>${type}</th>
                        <th>Group</th>
                    </tr>
                    ${map(values, makeTableRow)}
                </table>
            </div>
        </div>`;

        render(
            html`${templateTitle}
                <div class="modal-body">
                    <p>
                        Use the table below to combine multiple ${types} into
                        custom groups.
                    </p>
                    ${template}
                </div>
                ${templateButtons()}`,
            modal.content
        );
    }

    updateHtml();

    // Doesn't work. Why?
    modal.content.querySelector("select")?.focus();
}

/**
 * N.B. This is copy-paste from advanced filter. TODO: dedupe
 *
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {string[]} samples
 * @param {import("../sampleSlice.js").SampleHierarchy} sampleHierarchy
 */
function extractValues(attributeInfo, samples, sampleHierarchy) {
    const a = attributeInfo.accessor;
    return /** @type {import("@genome-spy/core/spec/channel.js").Scalar[]} */ (
        samples.map((sampleId) => a(sampleId, sampleHierarchy))
    );
}

/**
 * @param {string} s
 */
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
