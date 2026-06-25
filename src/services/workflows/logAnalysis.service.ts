import path from "node:path";
import { parseErrorManual } from "./errorManualParser.service";
import { readCell, readCsvRows, writeCsv } from "../../utils/csvFiles";
import type { Agent1OutputRow } from "../../types/workflows.domain";
import type { WorkflowArtifact } from "../../types/workflows.types";
import { cleanPartName } from "../../utils/workflowUtils";

export async function runLogAnalysis(input: {
    readonly artifactsDir: string;
    readonly errorManualPath: string;
    readonly machineLogsPath: string;
    readonly workflowId: string;
}): Promise<{
    readonly rows: readonly Agent1OutputRow[];
    readonly artifact: WorkflowArtifact;
}> {
    const manual = await parseErrorManual(input.errorManualPath);
    const logs = await readCsvRows(input.machineLogsPath);
    const rows: Agent1OutputRow[] = [];

    for (const logRow of logs) {
        const errorCode = readCell(logRow, "error_code");
        if (errorCode.length === 0 || errorCode === "None") {
            continue;
        }

        const manualEntry = manual.get(errorCode);
        const severity = manualEntry?.severity ?? "Unknown";
        const parts = manualEntry?.recommendedParts ?? [];

        if (parts.length === 0) {
            rows.push({
                timestamp: readCell(logRow, "timestamp"),
                machine_id: readCell(logRow, "machine_id"),
                machine_name: readCell(logRow, "machine_name"),
                error_code: errorCode,
                severity,
                part_name: "Unknown",
            });
            continue;
        }

        for (const part of parts) {
            rows.push({
                timestamp: readCell(logRow, "timestamp"),
                machine_id: readCell(logRow, "machine_id"),
                machine_name: readCell(logRow, "machine_name"),
                error_code: errorCode,
                severity,
                part_name: cleanPartName(part),
            });
        }
    }

    const outputPath = path.join(
        input.artifactsDir,
        input.workflowId,
        "agent1_output.csv",
    );
    await writeCsv(outputPath, rows);
    return {
        rows,
        artifact: {
            name: "agent1-output",
            path: outputPath,
            contentType: "text/csv",
        },
    };
}
