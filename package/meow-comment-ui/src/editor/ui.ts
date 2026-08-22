import { query } from "../lib/dom";
import type { View } from "../types";

export function renderView(): View {
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
                <textarea class="atk-textarea" name="comments" maxlength="10000" required></textarea>
            </div>
            <div class="atk-bottom">
                <div class="atk-item atk-bottom-left"></div>
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

    return {
        root,
        nameInput: query<HTMLInputElement>(root, ".atk-name"),
        emailInput: query<HTMLInputElement>(root, ".atk-email"),
        textarea: query<HTMLTextAreaElement>(root, ".atk-textarea"),
        sendButton: query<HTMLButtonElement>(root, ".atk-send-btn"),
        notifyWrap: query<HTMLElement>(root, ".atk-notify-wrap"),
        loading: query<HTMLElement>(root, ".atk-loading"),
    };
}
