import { css } from "lit";

export const formStyles = css`
    :host {
        --basic-spacing: var(--gs-basic-spacing, 10px);
        --form-control-color: var(--gs-control-text, #212529);
        --form-control-border-color: var(--gs-control-border, #ced4da);
        --form-control-border: 1px solid var(--form-control-border-color);
        --form-control-border-radius: var(--gs-control-radius, 0.25em);
    }

    .btn {
        display: inline-flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        gap: 0.2em;

        &.reverse {
            flex-direction: row-reverse;
        }

        padding: 4px 12px;
        margin: 0;
        font-size: 1em;
        line-height: 20px;
        color: var(--gs-control-text, #333333);
        text-align: center;
        vertical-align: middle;
        background: var(--gs-button-background, #fff);
        border: 1px solid var(--gs-control-border, #b3b3b3);
        border-radius: var(--gs-control-radius, 4px);
        box-shadow: var(--gs-button-shadow, none);

        &:hover:not(:disabled) {
            background: var(
                --gs-button-hover-background,
                var(--gs-hover-background, var(--gs-button-background, #f0f2f4))
            );
        }

        &:active:not(:disabled),
        &.chosen:not(:disabled) {
            background: var(
                --gs-button-selected-background,
                var(--gs-selected-background, #dfe5eb)
            );
            box-shadow: var(--gs-button-selected-shadow, none);
        }

        &:disabled {
            color: var(--gs-disabled-text, #a0a0a0);
            background: var(--gs-disabled-background, #f4f4f4);
            box-shadow: none;
        }

        &:focus-visible {
            outline: 2px solid var(--gs-focus-color, #2563a6);
            outline-offset: 2px;
        }

        &:not(:disabled) {
            cursor: pointer;
        }

        svg:first-child:not(:last-child) {
            font-size: 85%;
            margin-right: 0.3em;
        }

        svg:last-child:not(:first-child) {
            font-size: 85%;
            margin-left: 0.3em;
        }
    }

    .btn[type="color"] {
        padding: 2px;
    }

    .btn-group {
        display: flex;

        /* TODO: Extract to another class */
        font-size: 1.3em;

        .btn {
            flex-grow: 1;

            &:focus-visible {
                z-index: 1;
            }
        }

        .btn:not(:first-child) {
            border-top-left-radius: 0;
            border-bottom-left-radius: 0;
            margin-left: -1px;
        }
        .btn:not(:last-child) {
            border-top-right-radius: 0;
            border-bottom-right-radius: 0;
        }
    }

    .gs-form-group {
        > p:first-child {
            margin-top: 0;
        }

        &:not(:first-child) {
            margin-top: 0.5em;
        }

        &:not(:last-child) {
            margin-bottom: var(--basic-spacing);
        }

        label,
        div.label {
            display: inline-block;
            margin-bottom: 0.5em;
        }

        input[type="range"] {
            display: block;
            width: 100%;
        }

        input[type="text"],
        input[type="number"],
        select,
        textarea,
        .fake-input {
            display: block;
            width: 100%;
            box-sizing: border-box;
            padding: 0.375em 0.75em;
            font-size: 1em;
            font-family: var(--font-family);
            line-height: 1.5;
            color: var(--form-control-color);
            background-color: var(--gs-control-background, #fff);
            background-clip: padding-box;
            border: var(--form-control-border);
            border-radius: var(--form-control-border-radius);
            transition:
                border-color 0.15s ease-in-out,
                box-shadow 0.15s ease-in-out;

            /*
        // Doesn't work reliably
        &:invalid:not(:focus) {
            border-color: red;
            box-shadow: 0 0 5px 0px red;
        }
        */

            &::placeholder {
                color: var(--gs-muted-text, #a0a0a0);
            }

            &:focus-visible {
                outline-color: var(--gs-focus-color, revert);
            }
        }

        select {
            /* Copy-pasted from Bootstrap 5.1 */
            background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23343a40' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M2 5l6 6 6-6'/%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 0.75rem center;
            background-size: 16px 12px;
            appearance: none;
        }

        :is(input, select, textarea, div, label) + small {
            display: block;
            margin-top: 0.3em;
            color: var(--gs-muted-text, #606060);
        }

        label + small {
            margin-top: -0.3em;
        }

        :is(input, select, textarea).is-invalid,
        .fake-input.is-invalid {
            border-color: var(--danger-color, #dc3545);
            box-shadow: 0 0 0 0.2rem rgb(220 53 69 / 25%);
        }

        .invalid-feedback {
            display: block;
            margin-top: 0.25em;
            color: var(--danger-color, #dc3545);
            font-size: 0.875em;
        }

        .threshold-flex {
            display: flex;
            gap: var(--basic-spacing);

            &:not(:last-child) {
                margin-bottom: var(--basic-spacing);
            }

            * {
                margin-bottom: 0 !important; /* TODO: without important */
            }

            > :first-child {
                width: 5em;
            }

            > :last-child {
                padding: 0 var(--basic-spacing);
            }
        }

        .input-group {
            display: flex;
            gap: var(--basic-spacing);
        }
    }

    .gs-alert {
        display: flex;
        align-items: center;

        position: relative;
        padding: var(--basic-spacing);
        margin-bottom: var(--basic-spacing);
        border: 1px solid transparent;
        border-radius: var(--form-control-border-radius);
        contain: inline-size;
        max-width: 100%;

        > svg:first-child {
            width: 2em;
            height: 2em;
            margin-right: var(--basic-spacing);
        }

        &.danger {
            color: #58151c;
            background-color: #f8d7da;
            border-color: #f1aeb5;
        }

        &.warning {
            color: #664d03;
            background-color: #fff3cd;
            border-color: #ffecb5;
        }

        &.info {
            color: #055160;
            background-color: #cff4fc;
            border-color: #b6effb;
        }

        > div,
        > span {
            flex: 1 1 auto;
            min-width: 0;
        }

        > div {
            > :first-child {
                margin-top: 0;
            }

            > :last-child {
                margin-bottom: 0;
            }
        }

        ul,
        ol {
            padding-inline-start: 2em;
        }
    }

    .badge {
        display: inline-block;
        padding: 0.25em 0.5em;
        font-size: 75%;
        font-weight: 700;
        line-height: 1;
        background-color: #d0d0d0;
        border-radius: 0.25rem;
    }
`;
