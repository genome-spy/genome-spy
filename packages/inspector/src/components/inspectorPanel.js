import { LitElement, css, html, nothing } from "lit";

/**
 * @typedef {import("@genome-spy/core/debug/viewDebugSnapshot.js").ViewDebugNode} ViewDebugNode
 */

export class GsInspectorPanel extends LitElement {
    static properties = {
        session: { attribute: false },
        snapshot: { state: true },
        selectedViewId: { state: true },
        loading: { state: true },
    };

    static styles = css`
        :host {
            display: block;
            height: 100%;
            min-height: 0;
            color: #d8dee9;
            background: #20242b;
            font:
                12px/1.45 ui-monospace,
                SFMono-Regular,
                Menlo,
                Consolas,
                "Liberation Mono",
                monospace;
        }

        .shell {
            display: grid;
            grid-template-rows: auto 1fr;
            height: 100%;
            min-height: 0;
        }

        .toolbar {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.5rem 0.65rem;
            border-bottom: 1px solid #3a404a;
            background: #292e36;
        }

        button,
        label {
            font: inherit;
        }

        button {
            color: #d8dee9;
            background: #353b45;
            border: 1px solid #4a5260;
            border-radius: 4px;
            padding: 0.2rem 0.45rem;
            cursor: pointer;
        }

        button:hover {
            background: #414856;
        }

        .status {
            margin-left: auto;
            color: #9aa6b2;
        }

        .main {
            display: grid;
            grid-template-columns: minmax(15rem, 38%) minmax(0, 1fr);
            min-height: 0;
        }

        .tree,
        .details {
            min-height: 0;
            overflow: auto;
        }

        .tree {
            border-right: 1px solid #3a404a;
            padding: 0.4rem 0;
        }

        .details {
            padding: 0.75rem;
        }

        .empty {
            color: #9aa6b2;
            padding: 0.75rem;
        }

        .node {
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: center;
            gap: 0.45rem;
            width: 100%;
            min-width: 0;
            padding: 0.12rem 0.65rem;
            border: 0;
            border-radius: 0;
            background: transparent;
            color: inherit;
            text-align: left;
        }

        .node:hover {
            background: #303743;
        }

        .node.selected {
            background: #174f78;
        }

        .node-main {
            min-width: 0;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }

        .node-meta {
            color: #9aa6b2;
            white-space: nowrap;
        }

        .badge {
            display: inline-block;
            margin-left: 0.35rem;
            padding: 0 0.25rem;
            border: 1px solid #596273;
            border-radius: 3px;
            color: #b8c0cc;
        }

        h2,
        h3 {
            margin: 0 0 0.6rem;
            font-size: 1rem;
            line-height: 1.2;
        }

        h3 {
            margin-top: 1rem;
            font-size: 0.8rem;
            color: #9aa6b2;
            text-transform: uppercase;
        }

        dl {
            display: grid;
            grid-template-columns: max-content minmax(0, 1fr);
            gap: 0.25rem 0.75rem;
            margin: 0;
        }

        dt {
            color: #9aa6b2;
        }

        dd {
            margin: 0;
            min-width: 0;
            overflow-wrap: anywhere;
        }

        pre {
            margin: 0;
            padding: 0.6rem;
            overflow: auto;
            border: 1px solid #3a404a;
            border-radius: 4px;
            background: #171a20;
            color: #d8dee9;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 0.75rem;
        }

        th,
        td {
            padding: 0.25rem 0.35rem;
            border-bottom: 1px solid #303743;
            text-align: left;
            vertical-align: top;
        }

        th {
            color: #9aa6b2;
            font-weight: 600;
        }

        .linked {
            color: #8cc7ff;
            cursor: pointer;
        }
    `;

    constructor() {
        super();
        /** @type {import("../inspectorSession.js").default | undefined} */
        this.session = undefined;
        this.snapshot = {
            rootId: undefined,
            nodes: [],
            resolutions: {
                scales: [],
                axes: [],
                legends: [],
            },
        };
        this.selectedViewId = undefined;
        this.loading = false;
    }

    connectedCallback() {
        super.connectedCallback();
        this.#connectSession();
    }

    disconnectedCallback() {
        this.#disconnectSession();
        super.disconnectedCallback();
    }

    /**
     * @param {Map<string, any>} changed
     */
    updated(changed) {
        if (changed.has("session")) {
            this.#disconnectSession();
            this.#connectSession();
        }
    }

    /** @type {(() => void) | undefined} */
    #disconnect = undefined;

    #connectSession() {
        if (!this.session || this.#disconnect) {
            return;
        }

        const onSnapshot = () => {
            this.snapshot = this.session.snapshot;
            if (
                this.selectedViewId &&
                !this.snapshot.nodes.some(
                    (node) => node.id === this.selectedViewId
                )
            ) {
                this.selectedViewId = this.snapshot.rootId;
            } else {
                this.selectedViewId ??= this.snapshot.rootId;
            }
            this.loading = false;
        };

        this.session.addEventListener("snapshot", onSnapshot);
        this.#disconnect = () => {
            this.session?.removeEventListener("snapshot", onSnapshot);
            this.#disconnect = undefined;
        };
        this.#refresh();
    }

    #disconnectSession() {
        this.#disconnect?.();
    }

    render() {
        const root = this.#getRootNode();
        const selected = this.#getSelectedNode();

        return html`
            <div class="shell">
                <div class="toolbar">
                    <strong>GenomeSpy Inspector</strong>
                    <label>
                        <input
                            type="checkbox"
                            .checked=${this.session?.includeChrome ?? false}
                            @change=${(/** @type {Event} */ event) => {
                                const input = /** @type {HTMLInputElement} */ (
                                    event.target
                                );
                                void this.session?.setIncludeChrome(
                                    input.checked
                                );
                            }}
                        />
                        All chrome
                    </label>
                    <button @click=${() => this.#refresh()}>Refresh</button>
                    <span class="status">
                        ${this.loading
                            ? "Loading..."
                            : `${this.snapshot.nodes.length} views`}
                    </span>
                </div>
                <div class="main">
                    <div class="tree">
                        ${root
                            ? this.#renderNode(root, 0)
                            : html`<div class="empty">
                                  Launch the app to inspect the hierarchy.
                              </div>`}
                    </div>
                    <div class="details">
                        ${selected
                            ? this.#renderDetails(selected)
                            : html`<div class="empty">No view selected.</div>`}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * @param {ViewDebugNode} node
     * @param {number} depth
     * @returns {import("lit").TemplateResult}
     */
    #renderNode(node, depth) {
        const selected = node.id === this.selectedViewId;
        return html`
            <button
                class=${selected ? "node selected" : "node"}
                style=${`padding-left: ${0.65 + depth * 1.1}rem`}
                @click=${() => {
                    this.selectedViewId = node.id;
                }}
                @mouseenter=${() => this.session?.highlightView(node.id)}
                @mouseleave=${() => this.session?.highlightView(undefined)}
            >
                <span class="node-main">
                    ${node.childIds.length > 0 ? "v" : "-"} ${node.name}
                    ${node.chrome
                        ? html`<span class="badge">chrome</span>`
                        : nothing}
                    ${node.visible
                        ? nothing
                        : html`<span class="badge">hidden</span>`}
                </span>
                <span class="node-meta"> ${node.markType ?? node.type} </span>
            </button>
            ${node.childIds.map(
                /**
                 * @param {string} childId
                 * @returns {import("lit").TemplateResult}
                 */
                (childId) => this.#renderNode(this.#getNode(childId), depth + 1)
            )}
        `;
    }

    /**
     * @param {ViewDebugNode} node
     */
    #renderDetails(node) {
        return html`
            <h2>${node.path}</h2>
            <dl>
                <dt>id</dt>
                <dd>${node.id}</dd>
                <dt>class</dt>
                <dd>${node.className}</dd>
                <dt>type</dt>
                <dd>${node.type}</dd>
                <dt>mark</dt>
                <dd>${node.markType ?? "-"}</dd>
                <dt>selector</dt>
                <dd>${node.selector ? JSON.stringify(node.selector) : "-"}</dd>
                <dt>visible</dt>
                <dd>${String(node.visible)}</dd>
                <dt>configured visible</dt>
                <dd>${String(node.configuredVisible)}</dd>
                <dt>data init</dt>
                <dd>${node.dataInitializationState}</dd>
                <dt>bounds</dt>
                <dd>${node.bounds ? JSON.stringify(node.bounds) : "-"}</dd>
            </dl>

            <h3>Encodings</h3>
            ${this.#renderEncodings(node)}

            <h3>Resolutions</h3>
            <dl>
                <dt>scale</dt>
                <dd>${this.#formatRecord(node.scaleResolutionIds)}</dd>
                <dt>axis</dt>
                <dd>${this.#formatRecord(node.axisResolutionIds)}</dd>
                <dt>legend</dt>
                <dd>${this.#formatRecord(node.legendResolutionIds)}</dd>
            </dl>

            <h3>Params</h3>
            ${node.paramNames.length
                ? html`<pre>${node.paramNames.join("\n")}</pre>`
                : html`<p class="empty">No local parameter declarations.</p>`}

            <h3>All Resolutions</h3>
            ${this.#renderResolutionPanel()}

            <h3>Spec</h3>
            <pre>${JSON.stringify(node.spec, null, 2)}</pre>
        `;
    }

    /**
     * @param {ViewDebugNode} node
     */
    #renderEncodings(node) {
        const encodings = Object.values(node.encodings);
        if (encodings.length === 0) {
            return html`<p class="empty">No encodings.</p>`;
        }

        return html`
            <table>
                <thead>
                    <tr>
                        <th>channel</th>
                        <th>field / expr / value</th>
                        <th>type</th>
                        <th>scale</th>
                        <th>axis</th>
                        <th>legend</th>
                    </tr>
                </thead>
                <tbody>
                    ${encodings.map(
                        (encoding) => html`
                            <tr>
                                <td>${encoding.channel}</td>
                                <td>
                                    ${encoding.field ??
                                    encoding.expr ??
                                    this.#formatValue(encoding.value)}
                                </td>
                                <td>${encoding.type ?? "-"}</td>
                                <td>${encoding.scaleResolutionId ?? "-"}</td>
                                <td>${encoding.axisResolutionId ?? "-"}</td>
                                <td>${encoding.legendResolutionId ?? "-"}</td>
                            </tr>
                        `
                    )}
                </tbody>
            </table>
        `;
    }

    #renderResolutionPanel() {
        const { scales, axes, legends } = this.snapshot.resolutions;
        return html`
            <h3>Scales</h3>
            ${this.#renderScaleResolutions(scales)}
            <h3>Axes</h3>
            ${this.#renderAxisResolutions(axes)}
            <h3>Legends</h3>
            ${this.#renderLegendResolutions(legends)}
        `;
    }

    /**
     * @param {import("@genome-spy/core/debug/resolutionDebugSnapshot.js").ScaleResolutionDebugNode[]} scales
     */
    #renderScaleResolutions(scales) {
        if (scales.length === 0) {
            return html`<p class="empty">No scale resolutions.</p>`;
        }

        return html`
            <table>
                <thead>
                    <tr>
                        <th>id</th>
                        <th>channel</th>
                        <th>name</th>
                        <th>type</th>
                        <th>domain</th>
                        <th>members</th>
                    </tr>
                </thead>
                <tbody>
                    ${scales.map(
                        (scale) => html`
                            <tr>
                                <td>${scale.id}</td>
                                <td>${scale.channel}</td>
                                <td>${scale.name ?? "-"}</td>
                                <td>
                                    ${scale.resolvedScaleType ?? scale.type}
                                </td>
                                <td>
                                    ${this.#formatValue(
                                        scale.complexDomain ?? scale.domain
                                    )}
                                </td>
                                <td>
                                    ${scale.members.map(
                                        (member, index) => html`
                                            ${index > 0 ? ", " : nothing}
                                            <span
                                                class="linked"
                                                @click=${() => {
                                                    this.selectedViewId =
                                                        member.viewId;
                                                }}
                                                >${member.viewPath}:${member.channel}</span
                                            >
                                        `
                                    )}
                                </td>
                            </tr>
                        `
                    )}
                </tbody>
            </table>
        `;
    }

    /**
     * @param {import("@genome-spy/core/debug/resolutionDebugSnapshot.js").AxisResolutionDebugNode[]} axes
     */
    #renderAxisResolutions(axes) {
        if (axes.length === 0) {
            return html`<p class="empty">No axis resolutions.</p>`;
        }

        return html`
            <table>
                <thead>
                    <tr>
                        <th>id</th>
                        <th>channel</th>
                        <th>title</th>
                        <th>scale</th>
                        <th>members</th>
                    </tr>
                </thead>
                <tbody>
                    ${axes.map(
                        (axis) => html`
                            <tr>
                                <td>${axis.id}</td>
                                <td>${axis.channel}</td>
                                <td>${axis.title ?? "-"}</td>
                                <td>${axis.scaleResolutionId ?? "-"}</td>
                                <td>${axis.members.length}</td>
                            </tr>
                        `
                    )}
                </tbody>
            </table>
        `;
    }

    /**
     * @param {import("@genome-spy/core/debug/resolutionDebugSnapshot.js").LegendResolutionDebugNode[]} legends
     */
    #renderLegendResolutions(legends) {
        if (legends.length === 0) {
            return html`<p class="empty">No legend resolutions.</p>`;
        }

        return html`
            <table>
                <thead>
                    <tr>
                        <th>id</th>
                        <th>channel</th>
                        <th>definitions</th>
                        <th>members</th>
                    </tr>
                </thead>
                <tbody>
                    ${legends.map(
                        (legend) => html`
                            <tr>
                                <td>${legend.id}</td>
                                <td>${legend.channel}</td>
                                <td>${legend.definitionCount}</td>
                                <td>${legend.members.length}</td>
                            </tr>
                        `
                    )}
                </tbody>
            </table>
        `;
    }

    async #refresh() {
        if (!this.session) {
            return;
        }

        this.loading = true;
        await this.session.refresh();
    }

    /**
     * @returns {ViewDebugNode | undefined}
     */
    #getRootNode() {
        return this.snapshot.rootId
            ? this.#getNode(this.snapshot.rootId)
            : undefined;
    }

    /**
     * @returns {ViewDebugNode | undefined}
     */
    #getSelectedNode() {
        return this.selectedViewId
            ? this.#getNode(this.selectedViewId)
            : this.#getRootNode();
    }

    /**
     * @param {string} id
     * @returns {ViewDebugNode}
     */
    #getNode(id) {
        const node = this.snapshot.nodes.find(
            (candidate) => candidate.id === id
        );
        if (!node) {
            throw new Error("Unknown inspector node: " + id);
        }
        return node;
    }

    /**
     * @param {Record<string, string>} record
     * @returns {string}
     */
    #formatRecord(record) {
        const entries = Object.entries(record);
        return entries.length
            ? entries.map(([channel, id]) => channel + ": " + id).join(", ")
            : "-";
    }

    /**
     * @param {any} value
     * @returns {string}
     */
    #formatValue(value) {
        if (value === undefined) {
            return "-";
        }

        return typeof value === "string" ? value : JSON.stringify(value);
    }
}

customElements.define("gs-inspector-panel", GsInspectorPanel);
