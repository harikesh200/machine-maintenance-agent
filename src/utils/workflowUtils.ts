import { BadRequestError } from "../http/errors";

export function cleanPartName(name: string): string {
    return name
        .replace(/\s+/g, " ")
        .replace(/\s*-\s*/g, "-")
        .trim();
}

export function safeFilePart(value: string): string {
    const safe = value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
    if (safe.length === 0) {
        throw new BadRequestError(
            "Vendor name cannot be converted to a safe file name",
        );
    }
    return safe;
}

export function groupBy<T>(
    items: readonly T[],
    keyOf: (item: T) => string,
): Map<string, T[]> {
    const result = new Map<string, T[]>();
    for (const item of items) {
        const key = keyOf(item);
        const group = result.get(key) ?? [];
        group.push(item);
        result.set(key, group);
    }
    return result;
}
