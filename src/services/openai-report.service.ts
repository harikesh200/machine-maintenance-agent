import OpenAI from "openai";
import { UpstreamError } from "../http/errors";

export type ReportSummaryInput = {
    readonly severitySummary: string;
    readonly vendorCostSummary: string;
    readonly emailStatusSummary: string;
};

export type ReportService = ReturnType<typeof createOpenAiReportService>;

export function createOpenAiReportService(options: {
    readonly apiKey: string;
    readonly model: string;
}) {
    const client = new OpenAI({ apiKey: options.apiKey });

    return {
        async generateSummary(input: ReportSummaryInput): Promise<string> {
            try {
                const response = await client.responses.create({
                    model: options.model,
                    instructions:
                        "You are an expert manufacturing analyst and corporate reporting specialist. Generate clear, structured, detailed, insight-driven, business-oriented reports for plant leadership. Avoid markdown heading symbols and asterisks.",
                    input:
                        "Here is the summary table data in aggregated form:\n\n" +
                        `- Errors by severity: ${input.severitySummary}\n` +
                        `- Total parts cost by vendor in Indian Rupees: ${input.vendorCostSummary}\n` +
                        `- Email / PO status counts: ${input.emailStatusSummary}\n\n` +
                        "Generate a comprehensive plant-head-ready operational report. Highlight critical issues, machines or errors driving cost, and whether purchase orders were initiated. Ignore Unknown errors and no_po_generated instances when they represent rows without actual errors.",
                    temperature: 0.2,
                });

                const outputText = response.output_text.trim();
                if (outputText.length === 0) {
                    throw new UpstreamError("OpenAI returned an empty report");
                }
                return outputText;
            } catch (err) {
                if (err instanceof UpstreamError) {
                    throw err;
                }
                throw new UpstreamError("OpenAI report generation failed");
            }
        },
    };
}
