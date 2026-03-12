import { css, unsafeCSS } from "lit";
import { dom } from "@fortawesome/fontawesome-svg-core";

export const faStyles = unsafeCSS(dom.css());

export const playgroundComponentStyles = css`
    :host {
        color: var(--playground-panel-text, #172033);
        font-family: sans-serif;
    }

    .pill-tag {
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
        padding: 0.15rem 0.45rem;
        border-radius: 999px;
        background: var(--playground-accent-soft, rgba(84, 143, 204, 0.12));
        color: var(--playground-accent-text, #335679);
        font-weight: 600;
    }

    .chip-button {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.2rem 0.55rem;
        border: 1px solid
            var(--playground-border-strong, rgba(23, 32, 51, 0.14));
        border-radius: 999px;
        background: var(--playground-surface-raised, white);
        color: var(--playground-text-secondary, #364154);
        font: inherit;
        cursor: pointer;
    }

    .chip-button:hover {
        background: var(--playground-surface-hover, #f4f7fb);
    }

    .link-button {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0;
        border: none;
        background: none;
        color: var(--playground-accent-text, #335679);
        font: inherit;
        cursor: pointer;
    }

    .muted-text {
        color: var(--playground-muted-text, #566074);
    }
`;
