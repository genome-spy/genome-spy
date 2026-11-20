import { LitElement, css, html, nothing } from "lit";

/**
 * @typedef {{
 *   label: string,
 *   startedAt: number | null,
 * } & (
 *   { status: "running" } |
 *   { status: "cancelling" } |
 *   { status: "complete" | "failed" | "cancelled", finishedAt: number }
 * )} JobProgressState
 */

/**
 * Show progress and elapsed time for a job managed by the caller. Replace
 * activity when the job changes state, including after a cancel request.
 *
 * @tag gs-job-progress
 * @fires {Event} gs-job-cancel - Bubbles across shadow roots when a running job's Cancel control is activated.
 * @slot cancel - Optional control. The caller manages a slotted control's disabled state.
 * @slot message - Optional status content in the reserved message area.
 * @csspart cancel-button - Built-in Cancel button.
 * @csspart track - Progress bar track.
 * @csspart elapsed - Elapsed time readout.
 * @csspart message - Reserved status area.
 * @cssprop --gs-theme-primary - Progress fill.
 * @cssprop --gs-divider-color - Progress track fill.
 * @cssprop --gs-muted-text - Status and elapsed time text.
 * @cssprop --gs-job-message-height - Status area height, default 3lh.
 */
export default class JobProgress extends LitElement {
    static properties = {
        activity: { attribute: false },
        progress: { attribute: false },
        cancelLabel: { attribute: "cancel-label" },
        _now: { state: true },
    };

    /** @type {ReturnType<typeof setInterval> | undefined} */
    #clock;

    constructor() {
        super();

        /**
         * Replace the activity when its state changes. Timestamps are milliseconds
         * since the Unix epoch. Use a null start time when it is unknown.
         * @type {JobProgressState | null}
         */
        this.activity = null;

        /** @type {number | null} Completed fraction from 0 to 1, or null if unknown. */
        this.progress = null;

        /** Label of the built-in Cancel button. */
        this.cancelLabel = "Cancel";

        /** @private */
        this._now = Date.now();
    }

    static styles = css`
        :host {
            display: grid;
            gap: 6px;
            min-inline-size: 0;
        }

        :host([hidden]) {
            display: none;
        }

        button,
        ::slotted(button[slot="cancel"]) {
            padding: 7px 11px;
            border: 1px solid var(--gs-control-border, #b3b3b3);
            border-radius: var(--gs-control-radius, 4px);
            background: var(--gs-button-background, #fff);
            color: var(--gs-control-text, inherit);
            box-shadow: var(--gs-button-shadow, none);
            font: inherit;
            cursor: pointer;
        }

        button:hover:enabled,
        ::slotted(button[slot="cancel"]:hover:enabled) {
            background: var(
                --gs-button-hover-background,
                var(--gs-hover-background, var(--gs-button-background, #f0f2f4))
            );
        }

        button:disabled,
        ::slotted(button[slot="cancel"]:disabled) {
            background: var(--gs-disabled-background, #f4f4f4);
            color: var(--gs-disabled-text, #a0a0a0);
            box-shadow: none;
            cursor: default;
        }

        button:focus-visible,
        ::slotted(button[slot="cancel"]:focus-visible) {
            outline: 2px solid var(--gs-focus-color, #2563a6);
            outline-offset: 2px;
        }

        .track {
            --_progress-width: 35%;

            block-size: 4px;
            border-radius: 2px;
            overflow: hidden;
            background: var(--gs-divider-color, #dbe4e8);
        }

        .track[aria-hidden="true"] {
            visibility: hidden;
        }

        .track::after {
            display: block;
            content: "";
            inline-size: var(--_progress-width);
            block-size: 100%;
            background: var(--gs-theme-primary, #51678d);
        }

        @media (prefers-reduced-motion: no-preference) {
            .track[aria-hidden="false"]:not([aria-valuenow])::after {
                animation: waiting 1.4s ease-in-out infinite alternate;
            }
        }

        @keyframes waiting {
            to {
                transform: translateX(185%);
            }
        }

        .elapsed,
        .message {
            color: var(--gs-muted-text, #556772);
            font-size: 0.85em;
            line-height: 1.4;
        }

        .elapsed {
            min-block-size: 1lh;
            font-variant-numeric: tabular-nums;
        }

        .message {
            block-size: var(--gs-job-message-height, 3lh);
            overflow: auto;
            overflow-wrap: anywhere;
        }

        ::slotted([slot="message"]) {
            margin: 0;
        }
    `;

    connectedCallback() {
        super.connectedCallback();
        this.#syncClock();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        clearInterval(this.#clock);
    }

    /** @param {import("lit").PropertyValues<JobProgress>} changed */
    willUpdate(changed) {
        if (changed.has("activity")) {
            this.#syncClock();
        }
    }

    get #active() {
        const status = this.activity?.status;
        return status === "running" || status === "cancelling";
    }

    #syncClock() {
        clearInterval(this.#clock);
        this._now = Date.now();
        if (
            this.isConnected &&
            this.#active &&
            this.activity.startedAt !== null
        ) {
            this.#clock = setInterval(() => {
                this._now = Date.now();
            }, 1000);
        }
    }

    #elapsed() {
        const activity = this.activity;
        if (!activity) {
            return "";
        }
        if (activity.startedAt === null) {
            return "Elapsed time unavailable";
        }
        const end =
            activity.status === "running" || activity.status === "cancelling"
                ? this._now
                : activity.finishedAt;
        const seconds = Math.max(
            0,
            Math.floor((end - activity.startedAt) / 1000)
        );
        const minutes = Math.floor(seconds / 60);
        return `Elapsed ${minutes}:${String(seconds % 60).padStart(2, "0")}`;
    }

    #statusMessage() {
        const activity = this.activity;
        if (!activity) {
            return "";
        }
        if (activity.status === "cancelling") {
            return "Cancellation requested…";
        }
        return this.#active
            ? activity.label
            : `${activity.label} / ${activity.status}`;
    }

    #requestCancel() {
        if (this.activity?.status === "running") {
            this.dispatchEvent(
                new Event("gs-job-cancel", { bubbles: true, composed: true })
            );
        }
    }

    /** @returns {import("lit").HTMLTemplateResult} */
    render() {
        const percent = Number.isFinite(this.progress)
            ? Math.max(0, Math.min(100, this.progress * 100))
            : null;
        return html`
            <slot name="cancel" @click=${this.#requestCancel}>
                <button
                    part="cancel-button"
                    type="button"
                    ?disabled=${this.activity?.status !== "running"}
                >
                    ${this.cancelLabel}
                </button>
            </slot>
            <div
                class="track"
                part="track"
                role="progressbar"
                aria-label=${this.activity?.label || "Job progress"}
                aria-hidden=${String(!this.#active)}
                aria-valuenow=${percent === null ? nothing : Math.round(percent)}
                style=${
                    percent === null
                        ? nothing
                        : `--_progress-width: ${percent}%`
                }
            ></div>
            <div class="elapsed" part="elapsed" aria-live="off">
                ${this.#elapsed()}
            </div>
            <div class="message" part="message">
                <slot name="message">
                    <span role="status">${this.#statusMessage()}</span>
                </slot>
            </div>
        `;
    }
}
