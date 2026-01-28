import { css, unsafeCSS } from "lit";
import { dom } from "@fortawesome/fontawesome-svg-core";

export const faStyles = unsafeCSS(dom.css());

export const formStyles = css`
    :host {
        --basic-spacing: var(--gs-basic-spacing, 10px);
        --form-control-color: #212529;
        --form-control-border-color: #ced4da;
        --form-control-border: 1px solid var(--form-control-border-color);
        --form-control-border-radius: 0.25em;
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
        color: #333333;
        text-align: center;
        text-shadow: 0 1px 1px rgb(255 255 255 / 75%);
        vertical-align: middle;
        background-image: linear-gradient(to bottom, #ffffff, #e6e6e6);
        border: 1px solid #cccccc;
        border-color: rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.25);
        border-bottom-color: #b3b3b3;
        border-radius: 4px;
        box-shadow:
            inset 0 1px 0 rgb(255 255 255 / 20%),
            0 1px 2px rgb(0 0 0 / 5%);

        transition: color 0.15s;

        &:hover:not(:disabled) {
            background-image: linear-gradient(to bottom, #f8f8f8, #d8d8d8);
        }

        &:active {
            border-color: rgba(0, 0, 0, 0.2) rgba(0, 0, 0, 0.2)
                rgba(0, 0, 0, 0.5);
        }

        &:disabled {
            color: #a0a0a0;
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

        .btn.chosen {
            background-image: linear-gradient(to bottom, #f0f0f0, #d8d8d8);
            box-shadow: inset 0 2px 3px rgba(0, 0, 0, 0.3);
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
            background-color: #fff;
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
                color: #a0a0a0;
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

        :is(input, select, textarea, div) + small {
            display: block;
            margin-top: 0.5em;
            color: #606060;
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

    .gs-tabs {
        margin: 0;

        .tabs {
            display: flex;
            list-style: none;
            padding: 0;
            margin-top: 0;

            &::after {
                flex-grow: 1;
                content: "";
                display: block;
                border-bottom: 1px solid var(--form-control-border-color);
            }

            button {
                font-size: 1em;
                background-color: transparent;
                align-items: center;
                padding: 0.6em var(--basic-spacing);

                border: 1px solid var(--form-control-border-color);

                --radius: 5px;
                border-top-left-radius: var(--radius);
                border-top-right-radius: var(--radius);
                border-bottom-left-radius: 0;
                border-bottom-right-radius: 0;

                cursor: pointer;
            }

            > li:not(:first-child) > button {
                margin-left: -1px;
            }

            .active-tab button {
                border-bottom-color: transparent;
            }

            :not(.active-tab) button {
                border-color: transparent;
                border-bottom-color: var(--form-control-border-color);
            }
        }

        .panes > :not(.active-tab) {
            display: none;
        }
    }
`;
