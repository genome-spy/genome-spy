import { css, unsafeCSS } from "lit";
import { dom } from "@fortawesome/fontawesome-svg-core";

export const faStyles = unsafeCSS(dom.css());

/** Shared native controls; components own their layout. */
export const playgroundComponentStyles = css`
    :host {
        color: var(--playground-text);
        font-family: var(--playground-font-family);
        font-size: var(--playground-font-size);
        line-height: 1.4;
    }

    *,
    *::before,
    *::after {
        box-sizing: border-box;
    }

    button,
    input,
    select,
    textarea {
        font: inherit;
        color: inherit;
        accent-color: var(--playground-accent);
    }

    :is(button, a, input, select, textarea):focus-visible {
        outline: 2px solid var(--playground-accent);
        outline-offset: 2px;
    }

    .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 4px 12px;
        line-height: 20px;
        border: 1px solid var(--playground-border);
        border-radius: var(--playground-radius);
        background: var(--playground-surface);
        cursor: pointer;

        &:hover:not(:disabled) {
            background: var(--playground-hover);
        }

        &.primary {
            color: white;
            border-color: var(--playground-accent);
            background: var(--playground-accent);

            &:hover:not(:disabled) {
                background: var(--playground-accent-hover);
            }
        }

        &.quiet {
            padding: 0;
            border-color: transparent;
            background: transparent;
            color: var(--playground-accent-text);

            &:hover:not(:disabled) {
                text-decoration: underline;
            }
        }
    }

    button:disabled,
    input:disabled {
        cursor: default;
        opacity: 0.55;
    }

    .field {
        padding: 4px 8px;
        line-height: 20px;
        border: 1px solid var(--playground-border);
        border-radius: var(--playground-radius);
        background: var(--playground-surface);
        min-width: 0;
    }

    .tag {
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
        padding: 2px 6px;
        border-radius: var(--playground-radius);
        background: var(--playground-selected);
        color: var(--playground-accent-text);
        font-weight: 600;
    }

    .notice {
        padding: var(--playground-spacing);
        border: 1px solid var(--playground-border);
        border-radius: var(--playground-radius);
        background: var(--playground-panel);

        &.warning {
            border-color: var(--playground-warning-border);
            background: var(--playground-warning-bg);
        }

        > :first-child {
            margin-top: 0;
        }

        > :last-child {
            margin-bottom: 0;
        }
    }

    h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
    }

    .muted {
        color: var(--playground-muted);
    }

    .error {
        color: var(--playground-danger);
    }
`;
