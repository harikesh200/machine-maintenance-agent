import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import * as z from "zod";
import { UpstreamError } from "../http/errors";

/**
 * Bounded workflow evidence supplied to the report-generation model.
 */
export type ReportSummaryInput = {
    readonly findingCount: number;
    readonly unmatchedFindingCount: number;
    readonly analysisPeriod: string;
    readonly severityProfile: string;
    readonly recurringMachines: string;
    readonly recurringErrorCodes: string;
    readonly requiredParts: string;
    readonly vendorCostExposure: string;
    readonly purchaseOrderDelivery: string;
};

/**
 * Report-generation service boundary used by the workflow runner.
 */
export type ReportService = ReturnType<typeof createOpenAiReportService>;

const executiveReportContentSchema = z.object({
    executiveOverview: z.string().trim().min(80).max(700),
    managementAttention: z.string().trim().min(20).max(220),
    maintenanceAssessment: z.string().trim().min(80).max(750),
    procurementPosition: z.string().trim().min(60).max(650),
    managementActions: z
        .array(
            z.object({
                owner: z.enum([
                    "Maintenance",
                    "Procurement",
                    "Plant Operations",
                ]),
                action: z.string().trim().min(20).max(150),
                rationale: z.string().trim().min(20).max(150),
            }),
        )
        .min(3)
        .max(4),
    managementConclusion: z.string().trim().min(30).max(320),
});

export type ExecutiveReportContent = z.infer<
    typeof executiveReportContentSchema
>;

const reportInstructions = [
    "You are the plant maintenance manager writing an executive brief for the plant head.",
    "Write polished narrative content for a management PDF, not a metric dump. Use figures only as supporting evidence.",
    "Explain what deserves attention, why it matters operationally, what procurement or delivery issues exist, and what management should do next.",
    "Be decisive but evidence-based. Do not invent downtime, production loss, safety incidents, root causes, stock levels, or delivery impact.",
    "Avoid generic phrases such as significant operational risk, streamline the process, or monitor closely unless you state the exact issue and action.",
    "Return plain prose without headings, markdown, bullets, numbering, or formatting characters; the application controls document presentation.",
    "Use a formal, concise tone suitable for forwarding unchanged to senior management.",
    "Do not use Dollar Signs or any currency symbols in the output other than the Indian Rupee symbol (₹) or INR"
].join("\n");

/**
 * Creates the OpenAI-backed service that writes bounded narrative sections
 * for the plant-head PDF.
 */
export function createOpenAiReportService(options: {
    readonly apiKey: string;
    readonly model: string;
}) {
    const client = new OpenAI({ apiKey: options.apiKey });

    return {
        async generateSummary(
            input: ReportSummaryInput,
        ): Promise<ExecutiveReportContent> {
            try {
                const response = await client.responses.parse(
                    {
                        model: options.model,
                        instructions: reportInstructions,
                        input: [
                            "Prepare the narrative content for a two-page plant-head executive report.",
                            "Executive overview: 90-130 words explaining the overall position and principal management concern.",
                            "Management attention: one direct sentence naming the most important immediate focus.",
                            "Maintenance assessment: 90-130 words connecting severity, recurring equipment, error patterns, and required parts.",
                            "Procurement position: 70-110 words covering cost concentration, unmatched findings, purchase-order coverage, and delivery exceptions.",
                            "Management actions: provide three or four concrete actions with an owner and evidence-based rationale.",
                            "Management conclusion: 30-60 words stating the immediate management focus.",
                            "",
                            "Workflow evidence:",
                            JSON.stringify(input, null, 2),
                        ].join("\n"),
                        text: {
                            format: zodTextFormat(
                                executiveReportContentSchema,
                                "executive_report_content",
                            ),
                        },
                        temperature: 0.3,
                    },
                    { signal: AbortSignal.timeout(60_000) },
                );

                if (!response.output_parsed) {
                    throw new UpstreamError(
                        "OpenAI returned no executive report content",
                    );
                }
                return response.output_parsed;
            } catch (err) {
                if (err instanceof UpstreamError) {
                    throw err;
                }
                throw new UpstreamError("OpenAI report generation failed");
            }
        },
    };
}
