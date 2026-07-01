import type { ReportService } from "../openai-report.service";
import type {
    Agent1OutputRow,
    ErrorPartVendorRow,
    SummaryRow,
} from "../../types/workflows.domain";
import {
    generateExecutiveReportPdf,
    type ExecutivePriorityIssue,
    type ExecutiveVendorPosition,
} from "./executiveReportPdf.service";

/**
 * Builds the plant-head executive PDF entirely in memory.
 */
export async function runSummaryReport(input: {
    readonly reportService: ReportService;
    readonly workflowId: string;
    readonly agent1Rows: readonly Agent1OutputRow[];
    readonly errorPartVendorRows: readonly ErrorPartVendorRow[];
    readonly emailStatus: Readonly<Record<string, string>>;
}): Promise<Buffer> {
    const summaryRows = buildSummaryRows(
        input.agent1Rows,
        input.errorPartVendorRows,
        input.emailStatus,
    );
    summaryRows.sort(compareSummaryRows);

    const analysisPeriod = summarizeTimeRange(input.agent1Rows);
    const reportContent = await input.reportService.generateSummary({
        findingCount: input.agent1Rows.length,
        unmatchedFindingCount: summaryRows.filter(
            (row) => row.vendor.length === 0,
        ).length,
        analysisPeriod,
        severityProfile: summarizeCounts(
            input.agent1Rows.map((row) => row.severity),
        ),
        recurringMachines: summarizeCounts(
            input.agent1Rows.map(
                (row) => `${row.machine_name} (${row.machine_id})`,
            ),
        ),
        recurringErrorCodes: summarizeCounts(
            input.agent1Rows.map((row) => row.error_code),
        ),
        requiredParts: summarizeCounts(
            input.agent1Rows.map((row) => row.part_name),
        ),
        vendorCostExposure: summarizeVendorCosts(summaryRows),
        purchaseOrderDelivery:
            Object.entries(input.emailStatus)
                .map(([vendor, status]) => `${vendor}: ${status}`)
                .join(", ") || "No purchase orders generated",
    });

    const generatedAt = new Date().toISOString();
    return generateExecutiveReportPdf({
        workflowId: input.workflowId,
        analysisPeriod,
        generatedAt,
        findingCount: input.agent1Rows.length,
        highSeverityCount: input.agent1Rows.filter(
            (row) => row.severity.toLowerCase() === "high",
        ).length,
        unmatchedFindingCount: summaryRows.filter(
            (row) => row.vendor.length === 0,
        ).length,
        purchaseOrderVendorCount: Object.keys(input.emailStatus).length,
        priorityIssues: buildPriorityIssues(input.agent1Rows),
        vendorPositions: buildVendorPositions(
            summaryRows,
            input.emailStatus,
        ),
        content: reportContent,
    });
}

/**
 * Returns the three highest-severity recurring maintenance combinations.
 */
function buildPriorityIssues(
    rows: readonly Agent1OutputRow[],
): ExecutivePriorityIssue[] {
    const issues = new Map<
        string,
        { issue: ExecutivePriorityIssue; count: number }
    >();

    for (const row of rows) {
        const key = [
            row.machine_id,
            row.error_code,
            row.severity,
            row.part_name,
        ].join("\u0000");
        const current = issues.get(key);
        if (current) {
            current.count += 1;
            continue;
        }
        issues.set(key, {
            issue: {
                asset: `${row.machine_name} (${row.machine_id})`,
                errorCode: row.error_code,
                severity: row.severity,
                part: row.part_name,
                findingCount: 1,
            },
            count: 1,
        });
    }

    return Array.from(issues.values())
        .sort(
            (left, right) =>
                severityRank(right.issue.severity) -
                    severityRank(left.issue.severity) ||
                right.count - left.count ||
                left.issue.asset.localeCompare(right.issue.asset),
        )
        .slice(0, 3)
        .map(({ issue, count }) => ({ ...issue, findingCount: count }));
}

/**
 * Aggregates the highest-value purchase-order vendors for the PDF table.
 */
function buildVendorPositions(
    rows: readonly SummaryRow[],
    emailStatus: Readonly<Record<string, string>>,
): ExecutiveVendorPosition[] {
    const vendors = new Map<
        string,
        { amountInr: number; deliveryTimes: Set<string> }
    >();

    for (const row of rows) {
        if (row.vendor.length === 0 || row.price.length === 0) {
            continue;
        }
        const price = Number(row.price);
        if (!Number.isFinite(price)) {
            continue;
        }
        const current = vendors.get(row.vendor) ?? {
            amountInr: 0,
            deliveryTimes: new Set<string>(),
        };
        current.amountInr += price;
        if (row.delivery_time.length > 0) {
            current.deliveryTimes.add(row.delivery_time);
        }
        vendors.set(row.vendor, current);
    }

    return Array.from(vendors.entries())
        .map(([vendor, position]) => ({
            vendor,
            amountInr: position.amountInr,
            deliveryTime:
                Array.from(position.deliveryTimes).sort().join(", ") ||
                "Not available",
            deliveryStatus: formatDeliveryStatus(emailStatus[vendor]),
        }))
        .sort(
            (left, right) =>
                right.amountInr - left.amountInr ||
                left.vendor.localeCompare(right.vendor),
        )
        .slice(0, 5);
}

function severityRank(severity: string): number {
    const normalized = severity.toLowerCase();
    if (normalized === "high") {
        return 3;
    }
    if (normalized === "medium") {
        return 2;
    }
    if (normalized === "low") {
        return 1;
    }
    return 0;
}

function formatDeliveryStatus(status: string | undefined): string {
    if (status === "sent") {
        return "Delivered";
    }
    if (status === "no_email_configured") {
        return "Recipient not configured";
    }
    if (status === "failed") {
        return "Delivery failed";
    }
    return "Not generated";
}

/**
 * Expands maintenance findings into report rows by attaching every matching
 * vendor option for the recommended part.
 */
function buildSummaryRows(
    agent1Rows: readonly Agent1OutputRow[],
    errorPartVendorRows: readonly ErrorPartVendorRow[],
    emailStatus: Readonly<Record<string, string>>,
): SummaryRow[] {
    const rows: SummaryRow[] = [];
    for (const agentRow of agent1Rows) {
        const matches = errorPartVendorRows.filter((candidate) =>
            sameAgentRow(candidate, agentRow),
        );
        if (matches.length === 0) {
            rows.push({
                ...agentRow,
                vendor: "",
                price: "",
                delivery_time: "",
                vendor_email_status: "no_po_generated",
            });
            continue;
        }

        for (const match of matches) {
            rows.push({
                ...agentRow,
                vendor: match.vendor,
                price: String(match.price),
                delivery_time: match.delivery_time,
                vendor_email_status:
                    emailStatus[match.vendor] ?? "no_po_generated",
            });
        }
    }
    return rows;
}

/**
 * Matches a vendor row back to the exact maintenance finding that produced it.
 */
function sameAgentRow(left: Agent1OutputRow, right: Agent1OutputRow): boolean {
    return (
        left.timestamp === right.timestamp &&
        left.machine_id === right.machine_id &&
        left.machine_name === right.machine_name &&
        left.error_code === right.error_code &&
        left.severity === right.severity &&
        left.part_name === right.part_name
    );
}

/**
 * Provides stable ordering for deterministic report evidence.
 */
function compareSummaryRows(left: SummaryRow, right: SummaryRow): number {
    return (
        left.timestamp.localeCompare(right.timestamp) ||
        left.machine_id.localeCompare(right.machine_id) ||
        left.error_code.localeCompare(right.error_code) ||
        left.part_name.localeCompare(right.part_name)
    );
}

/**
 * Returns the top five occurrence counts as a compact prompt-safe string.
 */
function summarizeCounts(values: readonly string[]): string {
    const counts = new Map<string, number>();
    for (const value of values) {
        const normalizedValue = value.trim();
        if (normalizedValue.length === 0) {
            continue;
        }
        counts.set(normalizedValue, (counts.get(normalizedValue) ?? 0) + 1);
    }
    return (
        Array.from(counts.entries())
            .sort(
                ([leftValue, leftCount], [rightValue, rightCount]) =>
                    rightCount - leftCount ||
                    leftValue.localeCompare(rightValue),
            )
            .slice(0, 5)
            .map(([value, count]) => `${value}: ${count} occurrences`)
            .join(", ") || "None"
    );
}

/**
 * Returns the top five vendor totals from matched part prices.
 */
function summarizeVendorCosts(rows: readonly SummaryRow[]): string {
    const costs = new Map<string, number>();
    for (const row of rows) {
        if (row.vendor.length === 0 || row.price.length === 0) {
            continue;
        }
        const price = Number(row.price);
        if (!Number.isFinite(price)) {
            continue;
        }
        costs.set(row.vendor, (costs.get(row.vendor) ?? 0) + price);
    }
    return (
        Array.from(costs.entries())
            .sort(
                ([leftVendor, leftAmount], [rightVendor, rightAmount]) =>
                    rightAmount - leftAmount ||
                    leftVendor.localeCompare(rightVendor),
            )
            .slice(0, 5)
            .map(([vendor, amount]) => `${vendor}: ${amount.toFixed(2)}`)
            .join(", ") || "None"
    );
}

/**
 * Returns the analyzed log timestamp range used in the executive report.
 */
function summarizeTimeRange(rows: readonly Agent1OutputRow[]): string {
    const timestamps = rows
        .map((row) => row.timestamp.trim())
        .filter((timestamp) => timestamp.length > 0)
        .sort((left, right) => left.localeCompare(right));
    const firstTimestamp = timestamps[0];
    const lastTimestamp = timestamps[timestamps.length - 1];
    if (!firstTimestamp || !lastTimestamp) {
        return "Not available";
    }
    if (firstTimestamp === lastTimestamp) {
        return firstTimestamp;
    }
    return `${firstTimestamp} to ${lastTimestamp}`;
}
