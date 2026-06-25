import { readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import * as z from "zod";
import { ValidationError } from "../http/errors";

const csvRowsSchema = z.array(z.record(z.string(), z.unknown()));

export async function readCsvRows(
    filePath: string,
): Promise<readonly Record<string, unknown>[]> {
    const content = await readFile(filePath, "utf8");
    const parsed: unknown = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });
    return csvRowsSchema.parse(parsed);
}

export function readCell(
    row: Readonly<Record<string, unknown>>,
    key: string,
): string {
    const value = row[key];
    if (value === null || value === undefined) {
        throw new ValidationError(`CSV column ${key} is required`);
    }
    return String(value).trim();
}

export async function writeCsv(
    filePath: string,
    rows: readonly Record<string, unknown>[],
): Promise<void> {
    const csv = stringify([...rows], {
        header: true,
    });
    await writeFile(filePath, csv, "utf8");
}
