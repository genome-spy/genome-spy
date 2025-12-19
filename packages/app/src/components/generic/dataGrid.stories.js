import { html } from "lit";
import "./dataGrid.js";

export default {
    title: "Components/DataGrid",
    tags: ["autodocs"],
};

export const Basic = {
    render: () => html`
        <gs-data-grid
            .items=${[
                { name: "Alice", age: 30, city: "New York" },
                { name: "Bob", age: 25, city: "London" },
                { name: "Charlie", age: 35, city: "Paris" },
                { name: "Diana", age: 28, city: "Berlin" },
                { name: "Eve", age: 32, city: "Tokyo" },
            ]}
            style="height: 400px"
        ></gs-data-grid>
    `,
};

export const LargeDataset = {
    render: () => {
        const data = Array.from({ length: 100000 }, (_, i) => ({
            id: i + 1,
            name: `Person ${i + 1}`,
            value: Math.floor(Math.random() * 1000),
        }));

        return html`
            <gs-data-grid .items=${data} style="height: 400px"></gs-data-grid>
        `;
    },
};
