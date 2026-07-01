import { BadRequestError } from "../http/errors";

/**
 * Normalizes part names before comparing manual and vendor-catalog values.
 */
export function cleanPartName(name: string): string {
    return name
        .replace(/\s+/g, " ")
        .replace(/\s*-\s*/g, "-")
        .trim();
}

/**
 * Converts a vendor name into a safe invoice attachment filename segment.
 */
export function safeFilePart(value: string): string {
    const safe = value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
    if (safe.length === 0) {
        throw new BadRequestError(
            "Vendor name cannot be converted to a safe file name",
        );
    }
    return safe;
}

/**
 * Groups items by a string key while preserving item order inside each group.
 */
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
