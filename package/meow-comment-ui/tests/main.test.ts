import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MeowComments from "../src/main";

function response(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function fillEditor() {
    const name = document.querySelector<HTMLInputElement>(".atk-name")!;
    const email = document.querySelector<HTMLInputElement>(".atk-email")!;
    const textarea = document.querySelector<HTMLTextAreaElement>(".atk-textarea")!;
    name.value = "Meow";
    email.value = "meow@example.com";
    textarea.value = "Hello";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    email.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("MeowComments", () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="comments"></div>';
        window.localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("mounts, updates locale and destroys cleanly", () => {
        const client = MeowComments.init({
            el: "#comments",
            locale: "en",
            captcha: "disabled",
        });

        expect(document.querySelector(".artalk")).not.toBeNull();
        expect(document.querySelector<HTMLInputElement>(".atk-name")?.placeholder).toBe("Name");
        expect(document.querySelector<HTMLInputElement>(".atk-link")).toBeNull();

        client.update({ locale: "zh-CN", darkMode: true });

        expect(document.querySelector<HTMLInputElement>(".atk-name")?.placeholder).toBe("昵称");
        expect(document.querySelector(".artalk")?.classList.contains("atk-dark-mode")).toBe(true);

        client.destroy();
        expect(document.querySelector(".artalk")).toBeNull();
        expect(document.querySelector("#comments")?.textContent).toBe("");
    });

    it("reports validation errors without sending a request", () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const client = MeowComments.init({ el: "#comments", captcha: "disabled" });
        const name = document.querySelector<HTMLInputElement>(".atk-name")!;
        const email = document.querySelector<HTMLInputElement>(".atk-email")!;
        const textarea = document.querySelector<HTMLTextAreaElement>(".atk-textarea")!;
        name.value = "Meow";
        email.value = "invalid";
        textarea.value = "Hello";
        name.dispatchEvent(new Event("input", { bubbles: true }));
        email.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector<HTMLButtonElement>(".atk-send-btn")?.click();

        expect(document.querySelector(".atk-error")?.textContent).toContain("valid email");
        expect(fetchMock).not.toHaveBeenCalled();
        client.destroy();
    });

    it("submits a comment when CAPTCHA is disabled", async () => {
        const fetchMock = vi.fn().mockResolvedValue(response({ ok: true }, 201));
        vi.stubGlobal("fetch", fetchMock);
        const client = MeowComments.init({
            el: "#comments",
            baseUrl: "https://comments.example/",
            pageKey: "/article",
            pageTitle: "Article",
            captcha: "disabled",
        });
        fillEditor();
        document.querySelector<HTMLButtonElement>(".atk-send-btn")?.click();
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        expect(fetchMock.mock.calls[0]?.[0]).toBe("https://comments.example/api/comment");
        const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
        expect(payload).toMatchObject({
            username: "Meow",
            email: "meow@example.com",
            comments: "Hello",
            source_path: "/article",
            page_title: "Article",
        });
        expect(payload).not.toHaveProperty("link");
        await vi.waitFor(() =>
            expect(document.querySelector(".atk-success")?.textContent).toContain(
                "successfully",
            ),
        );
        client.destroy();
    });

    it("falls back to a CAPTCHA-free submit when auto CAPTCHA returns 404", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(response({ message: "captcha disabled" }, 404))
            .mockResolvedValueOnce(response({ ok: true }, 201));
        vi.stubGlobal("fetch", fetchMock);
        const client = MeowComments.init({ el: "#comments", captcha: "auto" });
        fillEditor();
        document.querySelector<HTMLButtonElement>(".atk-send-btn")?.click();

        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/verification");
        expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/comment");
        client.destroy();
    });

    it("opens the CAPTCHA dialog before submitting when verification is required", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                response({ uuid: "captcha-1", captcha_base64: "YWJj" }),
            )
            .mockResolvedValueOnce(response({ ok: true }, 201));
        vi.stubGlobal("fetch", fetchMock);
        const client = MeowComments.init({ el: "#comments", captcha: "required" });
        fillEditor();
        document.querySelector<HTMLButtonElement>(".atk-send-btn")?.click();
        await vi.waitFor(() => expect(document.querySelector(".atk-layer-dialog-wrap")).not.toBeNull());

        const input = document.querySelector<HTMLInputElement>(".atk-captcha-input")!;
        input.value = "ABCD";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector<HTMLButtonElement>(".atk-dialog-btn")?.click();
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

        expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
            verification_uuid: "captcha-1",
            verification_code: "ABCD",
        });
        client.destroy();
    });

    it("reloads CAPTCHA after an invalid verification response", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                response({ uuid: "captcha-1", captcha_base64: "YWJj" }),
            )
            .mockResolvedValueOnce(response({ message: "invalid" }, 422))
            .mockResolvedValueOnce(
                response({ uuid: "captcha-2", captcha_base64: "ZGVm" }),
            );
        vi.stubGlobal("fetch", fetchMock);
        const client = MeowComments.init({ el: "#comments", captcha: "required" });
        fillEditor();
        document.querySelector<HTMLButtonElement>(".atk-send-btn")?.click();
        await vi.waitFor(() => expect(document.querySelector(".atk-layer-dialog-wrap")).not.toBeNull());

        const input = document.querySelector<HTMLInputElement>(".atk-captcha-input")!;
        input.value = "ABCD";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector<HTMLButtonElement>(".atk-dialog-btn")?.click();

        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
        expect(document.querySelector(".atk-dialog-error")?.textContent).toContain("invalid or expired");
        expect(document.querySelector<HTMLImageElement>(".atk-captcha-img")?.src).toContain("ZGVm");
        client.destroy();
    });
});
