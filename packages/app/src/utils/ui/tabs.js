// TODO: Make a web component

/**
 * @param {MouseEvent} event
 */
export function handleTabClick(event) {
    event.stopPropagation();
    event.preventDefault();

    const target = /** @type {HTMLElement} */ (event.target);

    const li = target.parentElement;
    const ul = li.parentElement;
    const div = ul.parentElement;

    const tabPanes = div.querySelector(".panes");

    const clickedIndex = [...ul.children].findIndex((x) => x == li);

    for (const c of ul.children) {
        c.classList.remove("active-tab");
    }

    for (const c of tabPanes.children) {
        c.classList.remove("active-tab");
    }

    ul.children.item(clickedIndex).classList.add("active-tab");
    tabPanes.children.item(clickedIndex).classList.add("active-tab");
}
