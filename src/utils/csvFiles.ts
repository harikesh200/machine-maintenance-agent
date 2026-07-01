import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { ZodError, z, type ZodType } from "zod";
import { ValidationError } from "../http/errors";

function normalizeCsvHeader(header: string): string {
    return header.trim().toLowerCase();
}

/**
 * Parses and validates CSV content held in memory.
 */
export function parseCsvRows<Row>(
    content: Buffer | string,
    rowSchema: ZodType<Row>,
): readonly Row[] {
    const parsed: unknown = parse(
        typeof content === "string" ? content : content.toString("utf8"),
        {
            columns: (headers: string[]) => headers.map(normalizeCsvHeader),
            skip_empty_lines: true,
            trim: true,
        },
    );
    try {
        return z.array(rowSchema).parse(parsed);
    } catch (err) {
        if (err instanceof ZodError) {
            throw new ValidationError(
                "CSV file does not match the expected columns",
                z.flattenError(err),
            );
        }
        throw err;
    }
}

/**
 * Creates a headered CSV attachment buffer.
 */
export function createCsvBuffer(
    rows: readonly Record<string, unknown>[],
): Buffer {
    return Buffer.from(
        stringify([...rows], {
            header: true,
        }),
        "utf8",
    );
}
