import { PDFParse } from "pdf-parse";
import type { ErrorManualEntry } from "../../types/workflows.domain";
import { cleanPartName } from "../../utils/workflowUtils";

/**
 * Parses the uploaded maintenance manual PDF into error-code metadata.
 */
export async function parseErrorManual(
    manual: Buffer,
): Promise<ReadonlyMap<string, ErrorManualEntry>> {
    const parser = new PDFParse({ data: manual });

    try {
        const result = await parser.getText();
        const text = result.text.split(/\s+/).join(" ");
        const blocks = text.split(/Error Code:\s*(E\d+)/);
        const manual = new Map<string, ErrorManualEntry>();

        for (let index = 1; index < blocks.length; index += 2) {
            const errorCode = blocks[index];
            const blockText = blocks[index + 1];
            if (!errorCode || !blockText) {
                continue;
            }

            const description =
                blockText
                    .match(
                        /1\)\s*Error Description:\s*(.*?)(?:2\)\s*Possible Causes:)/i,
                    )?.[1]
                    ?.trim() ?? "";
            const causesRaw =
                blockText
                    .match(
                        /2\)\s*Possible Causes:\s*(.*?)(?:3\)\s*Recommended Part Replacement:)/i,
                    )?.[1]
                    ?.trim() ?? "";
            const partsRaw =
                blockText
                    .match(
                        /3\)\s*Recommended Part Replacement:\s*(.*?)(?:4\)\s*Severity:)/i,
                    )?.[1]
                    ?.trim() ?? "";
            const severity =
                blockText
                    .match(/4\)\s*Severity:\s*([A-Za-z]+)/i)?.[1]
                    ?.toLowerCase() ?? "unknown";

            manual.set(errorCode, {
                errorCode,
                description,
                possibleCauses: splitLetteredList(causesRaw),
                recommendedParts:
                    splitLetteredList(partsRaw).map(cleanPartName),
                severity: severity.charAt(0).toUpperCase() + severity.slice(1),
            });
        }

        return manual;
    } finally {
        await parser.destroy();
    }
}

function splitLetteredList(value: string): readonly string[] {
    return value
        .split(/[a-z]\)/)
        .map((item) => item.trim().replace(/[.]+$/u, "").trim())
        .filter((item) => item.length > 0);
}
