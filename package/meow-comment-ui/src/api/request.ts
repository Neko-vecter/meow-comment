function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function getResponseMessage(payload: unknown, fallback: string) {
    if (isRecord(payload) && typeof payload.message === "string") {
        return payload.message;
    }
    return fallback;
}

export class RequestError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "RequestError";
        this.status = status;
    }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (init?.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, { ...init, headers });
    const payload: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
        throw new RequestError(
            response.status,
            getResponseMessage(
                payload,
                response.statusText || "Request failed",
            ),
        );
    }

    return payload as T;
}
