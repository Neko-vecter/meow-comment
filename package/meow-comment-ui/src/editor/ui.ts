import { query } from "../lib/dom";
import type { View } from "../types";
import type { MeowCommentsToolbarItem } from "../types";
import { renderToolbar } from "./toolbar";

export function renderView(
    toolbarItems: MeowCommentsToolbarItem[],
    toolbarIcons: Partial<Record<MeowCommentsToolbarItem, string>> = {},
): View {
    const root = document.createElement("section");
    root.className = "artalk";
    root.innerHTML = `
        <div class="atk-main-editor">
            <div class="atk-header">
                <label class="atk-field">
                    <span class="atk-sr-only" data-label="name"></span>
                    <input class="atk-input atk-name" type="text" name="name" autocomplete="name" maxlength="64" required>
                </label>
                <label class="atk-field">
                    <span class="atk-sr-only" data-label="email"></span>
                    <input class="atk-input atk-email" type="email" name="email" autocomplete="email" maxlength="254" required>
                </label>
            </div>
            <div class="atk-textarea-wrap">
            </div>
            <div class="atk-bottom">
                <div class="atk-item atk-bottom-left">
                    <div class="atk-editor-toolbar" role="toolbar" aria-label="Formatting">
                        <button class="atk-editor-tool" type="button" data-action="bold" aria-label="Bold"><strong>B</strong></button>
                        <button class="atk-editor-tool" type="button" data-action="italic" aria-label="Italic"><em>I</em></button>
                        <button class="atk-editor-tool" type="button" data-action="underline" aria-label="Underline"><u>U</u></button>
                        <button class="atk-editor-tool" type="button" data-action="strike" aria-label="Strikethrough"><s>S</s></button>
                        <span class="atk-editor-tool-separator" aria-hidden="true"></span>
                        <button class="atk-editor-tool" type="button" data-action="code" aria-label="Inline code">{ }</button>
                        <button class="atk-editor-tool" type="button" data-action="blockquote" aria-label="Quote">66</button>
                        <button class="atk-editor-tool" type="button" data-action="codeBlock" aria-label="Code block">&lt;/&gt;</button>
                        <button class="atk-editor-tool" type="button" data-action="emoji" aria-label="Insert emoji">☻</button>
                    </div>
                </div>
                <div class="atk-item">
                    <button class="atk-send-btn" type="button"></button>
                </div>
            </div>
            <div class="atk-notify-wrap" aria-live="polite"></div>
            <div class="atk-loading" hidden>
                <div class="atk-loading-spinner" aria-hidden="true">
                    <svg viewBox="25 25 50 50" aria-hidden="true">
                        <circle cx="50" cy="50" r="20" fill="none" stroke-width="2" stroke-miterlimit="10"></circle>
                    </svg>
                </div>
            </div>
        </div>
    `;

    const view = {
        root,
        nameInput: query<HTMLInputElement>(root, ".atk-name"),
        emailInput: query<HTMLInputElement>(root, ".atk-email"),
        editorMount: query<HTMLElement>(root, ".atk-textarea-wrap"),
        toolbar: query<HTMLElement>(root, ".atk-editor-toolbar"),
        sendButton: query<HTMLButtonElement>(root, ".atk-send-btn"),
        notifyWrap: query<HTMLElement>(root, ".atk-notify-wrap"),
        loading: query<HTMLElement>(root, ".atk-loading"),
    };
    renderToolbar(view.toolbar, toolbarItems, toolbarIcons);
    return view;
}
