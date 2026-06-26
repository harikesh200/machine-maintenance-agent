import { readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { ZodError, z, type ZodType } from "zod";
import { ValidationError } from "../http/errors";

function normalizeCsvHeader(header: string): string {
    return header.trim().toLowerCase();
}

/**
 * Reads a CSV file into rows validated by the caller-provided row schema.
 */
export async function readCsvRows<Row>(
    filePath: string,
    rowSchema: ZodType<Row>,
): Promise<readonly Row[]> {
    const content = await readFile(filePath, "utf8");
    const parsed: unknown = parse(content, {
        columns: (headers: string[]) => headers.map(normalizeCsvHeader),
        skip_empty_lines: true,
        trim: true,
    });
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
 * Writes object rows as a headered CSV file.
 */
export async function writeCsv(
    filePath: string,
    rows: readonly Record<string, unknown>[],
): Promise<void> {
    const csv = stringify([...rows], {
        header: true,
    });
    await writeFile(filePath, csv, "utf8");
}
