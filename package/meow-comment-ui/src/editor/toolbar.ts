import type { MeowCommentsToolbarItem } from "../types";

export const DEFAULT_TOOLBAR_ITEMS: MeowCommentsToolbarItem[] = [
    "bold",
    "italic",
    "strike",
    "code",
    "codeBlock",
    "blockquote",
    "orderedList"
];

const TOOLBAR_BUTTONS: Record<
    MeowCommentsToolbarItem,
    { label: string; icon: string }
> = {
    bold: { label: "Bold", icon: "B" },
    italic: { label: "Italic", icon: "I" },
    underline: { label: "Underline", icon: "U" },
    strike: { label: "Strikethrough", icon: "S" },
    code: { label: "Inline code", icon: "{ }" },
    codeBlock: { label: "Code block", icon: "</>" },
    blockquote: { label: "Quote", icon: "66" },
    bulletList: { label: "Bulleted list", icon: "•" },
    orderedList: { label: "Numbered list", icon: "1." },
    emoji: { label: "Insert emoji", icon: "☺" },
};

export function resolveToolbarItems(
    toolbar: MeowCommentsToolbarItem[] | false | undefined,
) {
    if (toolbar === false) return [];
    const items = toolbar ?? [...DEFAULT_TOOLBAR_ITEMS];
    return items.filter(
        (item, index) =>
            Object.prototype.hasOwnProperty.call(TOOLBAR_BUTTONS, item) &&
            items.indexOf(item) === index,
    );
}

export function renderToolbar(
    toolbar: HTMLElement,
    items: MeowCommentsToolbarItem[],
    icons: Partial<Record<MeowCommentsToolbarItem, string>> = {},
) {
    toolbar.replaceChildren();
    toolbar.hidden = items.length === 0;

    for (const item of items) {
        if (item === "code" && toolbar.childElementCount > 0) {
            const separator = document.createElement("span");
            separator.className = "atk-editor-tool-separator";
            separator.setAttribute("aria-hidden", "true");
            toolbar.append(separator);
        }

        const definition = TOOLBAR_BUTTONS[item];
        const button = document.createElement("button");
        button.className = "atk-editor-tool";
        button.type = "button";
        button.dataset.action = item;
        button.setAttribute("aria-label", definition.label);
        button.setAttribute("aria-pressed", "false");
        button.textContent = icons[item] ?? definition.icon;
        if (item === "bold") button.style.fontWeight = "700";
        if (item === "italic") button.style.fontStyle = "italic";
        if (item === "underline") button.style.textDecoration = "underline";
        if (item === "strike") button.style.textDecoration = "line-through";
        toolbar.append(button);
    }
}
