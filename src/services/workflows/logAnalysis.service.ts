import * as z from "zod";
import { parseErrorManual } from "./errorManualParser.service";
import { parseCsvRows } from "../../utils/csvFiles";
import type { Agent1OutputRow } from "../../types/workflows.domain";
import { cleanPartName } from "../../utils/workflowUtils";

const machineLogRowSchema = z.object({
    timestamp: z.string().trim(),
    machine_id: z.string().trim().min(1),
    machine_name: z.string().trim().min(1),
    error_code: z.string().trim(),
});

/**
 * Analyzes in-memory machine logs against the uploaded error manual.
 */
export async function runLogAnalysis(input: {
    readonly errorManual: Buffer;
    readonly machineLogs: Buffer;
}): Promise<readonly Agent1OutputRow[]> {
    const manual = await parseErrorManual(input.errorManual);
    const logs = parseCsvRows(input.machineLogs, machineLogRowSchema);
    const rows: Agent1OutputRow[] = [];

    for (const logRow of logs) {
        const errorCode = logRow.error_code;
        if (errorCode.length === 0 || errorCode === "None") {
            continue;
        }

        const manualEntry = manual.get(errorCode);
        const severity = manualEntry?.severity ?? "Unknown";
        const parts = manualEntry?.recommendedParts ?? [];

        if (parts.length === 0) {
            rows.push({
                timestamp: logRow.timestamp,
                machine_id: logRow.machine_id,
                machine_name: logRow.machine_name,
                error_code: errorCode,
                severity,
                part_name: "Unknown",
            });
            continue;
        }

        for (const part of parts) {
            rows.push({
                timestamp: logRow.timestamp,
                machine_id: logRow.machine_id,
                machine_name: logRow.machine_name,
                error_code: errorCode,
                severity,
                part_name: cleanPartName(part),
            });
        }
    }

    return rows;
}
