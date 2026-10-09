import { LitElement, css, html, nothing } from "lit";
import { playgroundComponentStyles } from "./componentStyles.js";

const groupDescriptions = new Map([
    ["Docs", "Examples included in the documentation."],
    ["Core", "Non-curated examples, tests, and experiments."],
    ["App", "App examples, not viewable in the Playground."],
]);

/**
 * @typedef {{
 *   id: string;
 *   title: string;
 *   description: string;
 *   sourceGroup: string;
 *   sourceLabel: string;
 *   category: string;
 *   specPath: string;
 *   specUrl: string;
 *   screenshotPath: string | null;
 *   screenshotUrl: string | null;
 *   sourceMode: string;
 *   documentation: { title: string; url: string }[];
 * }} ExampleCatalogEntry
 */

export default class ExamplePicker extends LitElement {
    static properties = {
        open: { type: Boolean, reflect: true },
        loading: { type: Boolean },
        error: { type: String },
        entries: { attribute: false },
        search: { state: true },
    };

    static styles = [
        playgroundComponentStyles,
        css`
            :host {
                position: fixed;
                inset: 0;
                z-index: 10;
                display: none;
                background: var(--playground-backdrop);
            }

            :host([open]) {
                display: block;
            }

            .backdrop {
                display: flex;
                justify-content: flex-end;
                height: 100%;
            }

            .panel {
                width: min(68rem, 100%);
                height: 100%;
                display: flex;
                flex-direction: column;
                gap: 16px;
                padding: 20px;
                background: var(--playground-panel);
                box-shadow: var(--playground-shadow);
            }

            .header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 16px;

                p {
                    margin: 4px 0 0;
                    color: var(--playground-muted);
                }
            }

            .search {
                width: 100%;
            }

            .content {
                flex: 1;
                min-height: 0;
                overflow: auto;
                padding: 2px;
            }

            .status {
                margin: 0;
                padding: var(--playground-spacing) 0;
            }

            .group + .group {
                margin-top: 24px;
            }

            h3 {
                margin: 0 0 4px;
                font-size: var(--playground-font-size);
                font-weight: 600;
            }

            .group-description {
                margin: 0 0 var(--playground-spacing);
                color: var(--playground-muted);
                font-size: var(--playground-font-small);
            }

            .grid {
                display: grid;
                grid-template-columns: repeat(
                    auto-fill,
                    minmax(min(200px, 100%), 1fr)
                );
                gap: var(--playground-spacing);
            }

            .card {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 8px;
                padding: var(--playground-spacing);
                text-align: left;
                border: 1px solid var(--playground-border);
                border-radius: var(--playground-radius);
                background: var(--playground-surface);
                cursor: pointer;

                &:hover {
                    border-color: var(--playground-accent);
                    background: var(--playground-selected);
                }
            }

            .preview {
                display: block;
                width: 100%;
                aspect-ratio: 3 / 2;
                object-fit: cover;
                object-position: top center;
                border: 1px solid var(--playground-divider);
                border-radius: var(--playground-radius);
                background: var(--playground-panel);
            }

            img.preview {
                opacity: 0;
                transition: opacity 180ms ease;

                &.loaded {
                    opacity: 1;
                }
            }

            .placeholder {
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: var(--playground-font-small);
                color: var(--playground-muted);
            }

            .title {
                font-weight: 600;
            }

            .meta {
                font-size: var(--playground-font-small);
                color: var(--playground-muted);
            }

            @media (max-width: 700px) {
                .panel {
                    width: 100%;
                    padding: var(--playground-spacing);
                }
            }
        `,
    ];

    constructor() {
        super();
        this.open = false;
        this.loading = false;
        this.error = "";
        /** @type {ExampleCatalogEntry[]} */
        this.entries = [];
        this.search = "";
        this.loadedPreviewIds = new Set();
    }

    /**
     * @param {import("lit").PropertyValues<this>} changedProperties
     */
    updated(changedProperties) {
        if (changedProperties.has("open") && this.open) {
            this.search = "";
            queueMicrotask(() =>
                /** @type {HTMLInputElement | null} */ (
                    this.renderRoot.querySelector(".search")
                )?.focus()
            );
        }
    }

    render() {
        if (!this.open) {
            return nothing;
        }

        const groups = this.#getGroups();
        let entryIndex = 0;

        return html`
            <div class="backdrop" @click=${this.#close}>
                <aside class="panel" @click=${this.#stopPropagation}>
                    <div class="header">
                        <div>
                            <h2>Examples</h2>
                            <p>
                                Explore examples from the documentation, Core,
                                and App.
                            </p>
                        </div>
                        <button
                            class="button close-button"
                            @click=${this.#close}
                        >
                            Close
                        </button>
                    </div>
                    <input
                        class="field search"
                        type="search"
                        placeholder="Search examples"
                        .value=${this.search}
                        @input=${this.#handleSearch}
                    />
                    <div class="content">
                        ${
                            this.loading
                                ? html`<p class="status muted">
                                      Loading example catalog...
                                  </p>`
                                : this.error
                                  ? html`<p class="status error">
                                        ${this.error}
                                    </p>`
                                  : groups.length === 0
                                    ? html`<p class="status muted">
                                          No examples matched the current
                                          search.
                                      </p>`
                                    : groups.map(([label, entries]) => {
                                          const startIndex = entryIndex;
                                          entryIndex += entries.length;
                                          return this.#renderGroup(
                                              label,
                                              entries,
                                              startIndex
                                          );
                                      })
                        }
                    </div>
                </aside>
            </div>
        `;
    }

    /**
     * @param {string} label
     * @param {ExampleCatalogEntry[]} entries
     * @param {number} startIndex
     */
    #renderGroup(label, entries, startIndex) {
        const description = groupDescriptions.get(label);

        return html`
            <section class="group">
                <h3>${label}</h3>
                ${description ? html`<p class="group-description">${description}</p>` : nothing}
                <div class="grid">
                    ${entries.map((entry, index) =>
                        this.#renderCard(entry, startIndex + index)
                    )}
                </div>
            </section>
        `;
    }

    /**
     * @param {ExampleCatalogEntry} entry
     * @param {number} ordinal
     */
    #renderCard(entry, ordinal) {
        const eager = ordinal < 8;
        const isLoaded = this.loadedPreviewIds.has(entry.id);
        return html`
            <button class="card" @click=${() => this.#openEntry(entry)}>
                ${
                    entry.screenshotUrl
                        ? html`
                              <img
                                  class="preview ${isLoaded ? "loaded" : ""}"
                                  src=${entry.screenshotUrl}
                                  alt=""
                                  loading=${eager ? "eager" : "lazy"}
                                  decoding="async"
                                  fetchpriority=${eager ? "high" : "low"}
                                  @load=${() => this.#markPreviewLoaded(entry.id)}
                                  @error=${() => this.#markPreviewLoaded(entry.id)}
                              />
                          `
                        : html`
                              <div
                                  class="preview placeholder"
                                  aria-hidden="true"
                              >
                                  <span>${entry.sourceLabel}</span>
                              </div>
                          `
                }
                <span class="title">${entry.title}</span>
                <span class="meta">${entry.category}</span>
            </button>
        `;
    }

    #close() {
        this.dispatchEvent(
            new CustomEvent("close", { bubbles: true, composed: true })
        );
    }

    /**
     * @param {ExampleCatalogEntry} entry
     */
    #openEntry(entry) {
        this.dispatchEvent(
            new CustomEvent("open-example", {
                detail: { entry },
                bubbles: true,
                composed: true,
            })
        );
    }

    /**
     * @param {InputEvent} event
     */
    #handleSearch(event) {
        const target = /** @type {HTMLInputElement} */ (event.target);
        this.search = target.value;
    }

    /**
     * @param {string} entryId
     */
    #markPreviewLoaded(entryId) {
        if (this.loadedPreviewIds.has(entryId)) {
            return;
        }

        this.loadedPreviewIds.add(entryId);
        this.requestUpdate();
    }

    /**
     * @param {Event} event
     */
    #stopPropagation(event) {
        event.stopPropagation();
    }

    #getGroups() {
        const normalizedSearch = this.search.trim().toLowerCase();
        const visibleEntries = normalizedSearch
            ? this.entries.filter(
                  (entry) =>
                      entry.title.toLowerCase().includes(normalizedSearch) ||
                      entry.description
                          .toLowerCase()
                          .includes(normalizedSearch) ||
                      entry.category.toLowerCase().includes(normalizedSearch)
              )
            : this.entries;

        /** @type {Map<string, ExampleCatalogEntry[]>} */
        const groupedEntries = new Map();

        for (const entry of visibleEntries) {
            const key = entry.sourceLabel;
            const bucket = groupedEntries.get(key);
            if (bucket) {
                bucket.push(entry);
            } else {
                groupedEntries.set(key, [entry]);
            }
        }

        return Array.from(groupedEntries.entries());
    }
}

customElements.define("gs-example-picker", ExamplePicker);

export { ExamplePicker as GsExamplePicker };
