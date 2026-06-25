import { css } from "lit";

export const inspectorPanelStyles = css`
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

    .toolbar-title {
        white-space: nowrap;
    }

    .panel-tabs {
        display: flex;
        gap: 0.2rem;
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

    .panel-tab {
        color: #b8c0cc;
        background: transparent;
        border-color: transparent;
    }

    .panel-tab.selected {
        color: #f4f7fb;
        background: #174f78;
        border-color: #2d6e9e;
    }

    .close-button {
        margin-left: auto;
    }

    .main {
        display: grid;
        grid-template-columns: minmax(15rem, 38%) minmax(0, 1fr);
        height: 100%;
        min-height: 0;
    }

    .single-panel {
        display: block;
        box-sizing: border-box;
        height: 100%;
        min-height: 0;
        overflow: auto;
        padding: 0.75rem;
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

    .tree-controls {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.2rem 0.65rem 0.45rem;
        border-bottom: 1px solid #303743;
        margin-bottom: 0.3rem;
        color: #b8c0cc;
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

    .node.warning {
        color: #ffcf8a;
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

    .muted {
        color: #9aa6b2;
    }

    .flow-first {
        max-height: 22rem;
    }
`;
