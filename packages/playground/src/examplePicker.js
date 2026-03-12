import { LitElement, css, html, nothing } from "lit";
import { playgroundComponentStyles } from "./componentStyles.js";

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
                justify-content: flex-end;
                background: rgba(17, 24, 39, 0.35);
                backdrop-filter: blur(2px);
            }

            :host([open]) {
                display: flex;
            }

            .panel {
                width: min(68rem, 100vw);
                height: 100vh;
                display: flex;
                flex-direction: column;
                gap: 1rem;
                padding: 1.25rem;
                box-sizing: border-box;
                background: var(--playground-panel-bg, #f7f5ef);
                box-shadow: -10px 0 30px rgba(0, 0, 0, 0.18);
            }

            .header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 1rem;
            }

            .header h2,
            .header p {
                margin: 0;
            }

            .header h2 {
                font-size: 1.7rem;
            }

            .header p {
                margin-top: 0.35rem;
                color: var(--playground-muted-text, #566074);
            }

            .close-button {
                padding: 0.55rem 0.85rem;
            }

            .search {
                width: 100%;
                padding: 0.75rem 0.9rem;
                box-sizing: border-box;
                border: 1px solid
                    var(--playground-border-soft, rgba(23, 32, 51, 0.15));
                border-radius: 0.8rem;
                background: var(
                    --playground-surface-soft,
                    rgba(255, 255, 255, 0.82)
                );
                font: inherit;
            }

            .content {
                flex: 1;
                overflow: auto;
                padding-right: 0.25rem;
            }

            .status {
                margin: 0;
                padding: 0.9rem 0;
                color: var(--playground-muted-text, #566074);
            }

            .status.error {
                color: var(--playground-danger-text, #9c2f2f);
            }

            .group + .group {
                margin-top: 1.75rem;
            }

            .group h3 {
                margin: 0 0 0.8rem;
                font-size: 1.15rem;
                letter-spacing: 0.02em;
            }

            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr));
                gap: 0.9rem;
            }

            .card {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 0.45rem;
                padding: 0.75rem;
                text-align: left;
                border: 1px solid
                    var(--playground-border, rgba(23, 32, 51, 0.1));
                border-radius: 0.9rem;
                background: var(
                    --playground-surface-card,
                    rgba(255, 255, 255, 0.88)
                );
                color: inherit;
                cursor: pointer;
                transition:
                    transform 120ms ease,
                    border-color 120ms ease,
                    background-color 120ms ease;
                font: inherit;
            }

            .card:hover,
            .card:focus-visible {
                transform: translateY(-1px);
                border-color: var(
                    --playground-accent-border,
                    rgba(84, 143, 204, 0.65)
                );
                background: var(--playground-surface-raised, white);
                outline: none;
            }

            .preview {
                display: block;
                width: 100%;
                aspect-ratio: 3 / 2;
                object-fit: cover;
                object-position: top center;
                border-radius: 0.65rem;
                background: linear-gradient(
                    135deg,
                    var(--playground-preview-bg-start, #e8efe8),
                    var(--playground-preview-bg-end, #f8f9fb)
                );
                border: 1px solid
                    var(--playground-border-faint, rgba(23, 32, 51, 0.08));
            }

            .placeholder {
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--playground-muted-strong, #6c7688);
                font-size: 0.82rem;
                font-weight: 600;
                letter-spacing: 0.03em;
                text-transform: uppercase;
                background:
                    radial-gradient(
                        circle at top left,
                        var(--playground-accent-soft, rgba(84, 143, 204, 0.12)),
                        transparent 55%
                    ),
                    linear-gradient(
                        135deg,
                        var(--playground-placeholder-bg-start, #f3efe4),
                        var(--playground-placeholder-bg-end, #fbfaf6)
                    );
            }

            .title {
                font-weight: 600;
                line-height: 1.3;
            }

            .meta {
                font-size: 0.82rem;
                color: var(--playground-muted-strong, #6c7688);
            }

            @media (max-width: 700px) {
                .panel {
                    width: 100vw;
                    padding: 1rem;
                }

                .grid {
                    grid-template-columns: repeat(
                        auto-fill,
                        minmax(10.5rem, 1fr)
                    );
                    gap: 0.75rem;
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

        return html`
            <div @click=${this.#close}>
                <aside class="panel" @click=${this.#stopPropagation}>
                    <div class="header">
                        <div>
                            <h2>Examples</h2>
                            <p>Curated shared examples from the monorepo.</p>
                        </div>
                        <button
                            class="chip-button close-button"
                            @click=${this.#close}
                        >
                            Close
                        </button>
                    </div>
                    <input
                        class="search"
                        type="search"
                        placeholder="Search examples"
                        .value=${this.search}
                        @input=${this.#handleSearch}
                    />
                    <div class="content">
                        ${this.loading
                            ? html`<p class="status">
                                  Loading example catalog...
                              </p>`
                            : this.error
                              ? html`<p class="status error">${this.error}</p>`
                              : groups.length === 0
                                ? html`<p class="status">
                                      No examples matched the current search.
                                  </p>`
                                : groups.map(([label, entries]) =>
                                      this.#renderGroup(label, entries)
                                  )}
                    </div>
                </aside>
            </div>
        `;
    }

    /**
     * @param {string} label
     * @param {ExampleCatalogEntry[]} entries
     */
    #renderGroup(label, entries) {
        return html`
            <section class="group">
                <h3>${label}</h3>
                <div class="grid">
                    ${entries.map((entry) => this.#renderCard(entry))}
                </div>
            </section>
        `;
    }

    /**
     * @param {ExampleCatalogEntry} entry
     */
    #renderCard(entry) {
        return html`
            <button class="card" @click=${() => this.#openEntry(entry)}>
                ${entry.screenshotUrl
                    ? html`
                          <img
                              class="preview"
                              src=${entry.screenshotUrl}
                              alt=""
                              loading="lazy"
                          />
                      `
                    : html`
                          <div class="preview placeholder" aria-hidden="true">
                              <span>${entry.sourceLabel}</span>
                          </div>
                      `}
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
    /**
     * @param {InputEvent} event
     */
    #handleSearch(event) {
        const target = /** @type {HTMLInputElement} */ (event.target);
        this.search = target.value;
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
