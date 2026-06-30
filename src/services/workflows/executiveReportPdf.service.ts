import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import PDFDocument from "pdfkit";
import type { ExecutiveReportContent } from "../openai-report.service";

const colors = {
    navy: "#17324D",
    navyLight: "#244B6B",
    slate: "#526777",
    text: "#22313D",
    muted: "#6F7F8C",
    border: "#D7E0E7",
    panel: "#F3F6F8",
    teal: "#0F766E",
    amber: "#B45309",
    red: "#B42318",
    white: "#FFFFFF",
} as const;

export type ExecutivePriorityIssue = {
    readonly asset: string;
    readonly errorCode: string;
    readonly severity: string;
    readonly part: string;
    readonly findingCount: number;
};

export type ExecutiveVendorPosition = {
    readonly vendor: string;
    readonly amountInr: number;
    readonly deliveryTime: string;
    readonly deliveryStatus: string;
};

export type ExecutiveReportPdfInput = {
    readonly outputPath: string;
    readonly workflowId: string;
    readonly analysisPeriod: string;
    readonly generatedAt: string;
    readonly findingCount: number;
    readonly highSeverityCount: number;
    readonly unmatchedFindingCount: number;
    readonly purchaseOrderVendorCount: number;
    readonly priorityIssues: readonly ExecutivePriorityIssue[];
    readonly vendorPositions: readonly ExecutiveVendorPosition[];
    readonly content: ExecutiveReportContent;
};

/**
 * Writes a deterministic two-page A4 executive maintenance report.
 */
export async function writeExecutiveReportPdf(
    input: ExecutiveReportPdfInput,
): Promise<void> {
    const temporaryPath = `${input.outputPath}.tmp`;
    try {
        await renderPdfToPath(input, temporaryPath);
        await rename(temporaryPath, input.outputPath);
    } catch (err) {
        await rm(temporaryPath, { force: true });
        throw err;
    }
}

async function renderPdfToPath(
    input: ExecutiveReportPdfInput,
    outputPath: string,
): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const document = new PDFDocument({
            size: "A4",
            margins: { top: 42, right: 46, bottom: 42, left: 46 },
            bufferPages: true,
            info: {
                Title: "Plant Maintenance Executive Report",
                Author: "Maintenance Automation System",
                Subject: `Workflow ${input.workflowId}`,
            },
        });
        const output = createWriteStream(outputPath);

        document.once("error", reject);
        output.once("error", reject);
        output.once("finish", resolve);
        document.pipe(output);

        try {
            drawFirstPage(document, input);
            document.addPage();
            drawSecondPage(document, input);
            if (document.bufferedPageRange().count !== 2) {
                throw new Error("Executive report exceeded two pages");
            }
            drawPageFooters(document, input.workflowId);
            document.end();
        } catch (err) {
            output.destroy();
            reject(err);
        }
    });
}

function drawFirstPage(
    document: PDFKit.PDFDocument,
    input: ExecutiveReportPdfInput,
): void {
    drawPrimaryHeader(document, input);
    drawKpiRow(document, input);

    let positionY = 210;
    positionY = drawNarrativeSection(
        document,
        "Executive Overview",
        input.content.executiveOverview,
        positionY,
    );
    positionY = drawAttentionPanel(
        document,
        input.content.managementAttention,
        positionY + 8,
    );
    positionY = drawNarrativeSection(
        document,
        "Maintenance Assessment",
        input.content.maintenanceAssessment,
        positionY + 14,
    );
    drawPriorityIssues(document, input.priorityIssues, positionY + 14);
}

function drawSecondPage(
    document: PDFKit.PDFDocument,
    input: ExecutiveReportPdfInput,
): void {
    drawSecondaryHeader(document, input);

    let positionY = 112;
    positionY = drawNarrativeSection(
        document,
        "Procurement and Delivery Position",
        input.content.procurementPosition,
        positionY,
    );
    positionY = drawVendorPositions(
        document,
        input.vendorPositions,
        positionY + 14,
    );
    positionY = drawManagementActions(
        document,
        input.content.managementActions,
        positionY + 18,
    );
    drawConclusion(
        document,
        input.content.managementConclusion,
        positionY + 16,
    );
}

function drawPrimaryHeader(
    document: PDFKit.PDFDocument,
    input: ExecutiveReportPdfInput,
): void {
    const pageWidth = document.page.width;
    document.rect(0, 0, pageWidth, 104).fill(colors.navy);
    document
        .fillColor("#A9C4D8")
        .font("Helvetica-Bold")
        .fontSize(8)
        .text("OPERATIONS  /  MAINTENANCE", 46, 24, {
            characterSpacing: 1.4,
        });
    document
        .fillColor(colors.white)
        .font("Helvetica-Bold")
        .fontSize(23)
        .text("Plant Maintenance", 46, 43);
    document.fontSize(23).text("Executive Report", 46, 69);
    document
        .fillColor("#D7E5EF")
        .font("Helvetica")
        .fontSize(8.5)
        .text(`Reporting period  ${input.analysisPeriod}`, 340, 49, {
            width: 208,
            align: "right",
        });
    document.text(
        `Generated  ${formatGeneratedAt(input.generatedAt)}`,
        340,
        68,
        {
            width: 208,
            align: "right",
        },
    );
}

function drawSecondaryHeader(
    document: PDFKit.PDFDocument,
    input: ExecutiveReportPdfInput,
): void {
    document.rect(0, 0, document.page.width, 72).fill(colors.navy);
    document
        .fillColor(colors.white)
        .font("Helvetica-Bold")
        .fontSize(16)
        .text("Plant Maintenance Executive Report", 46, 25);
    document
        .fillColor("#D7E5EF")
        .font("Helvetica")
        .fontSize(8.5)
        .text(input.analysisPeriod, 340, 29, {
            width: 208,
            align: "right",
        });
}

function drawKpiRow(
    document: PDFKit.PDFDocument,
    input: ExecutiveReportPdfInput,
): void {
    const cards = [
        {
            label: "MAINTENANCE FINDINGS",
            value: String(input.findingCount),
            color: colors.navyLight,
        },
        {
            label: "HIGH SEVERITY",
            value: String(input.highSeverityCount),
            color: colors.red,
        },
        {
            label: "UNMATCHED FINDINGS",
            value: String(input.unmatchedFindingCount),
            color: colors.amber,
        },
        {
            label: "PO VENDORS",
            value: String(input.purchaseOrderVendorCount),
            color: colors.teal,
        },
    ];
    const gap = 8;
    const cardWidth = (document.page.width - 92 - gap * 3) / 4;

    cards.forEach((card, index) => {
        const positionX = 46 + index * (cardWidth + gap);
        document
            .roundedRect(positionX, 126, cardWidth, 58, 4)
            .fillAndStroke(colors.panel, colors.border);
        document.rect(positionX, 126, 4, 58).fill(card.color);
        document
            .fillColor(colors.muted)
            .font("Helvetica-Bold")
            .fontSize(6.5)
            .text(card.label, positionX + 12, 138, {
                width: cardWidth - 19,
                characterSpacing: 0.35,
            });
        document
            .fillColor(colors.text)
            .font("Helvetica-Bold")
            .fontSize(20)
            .text(card.value, positionX + 12, 153, {
                width: cardWidth - 19,
            });
    });
}

function drawNarrativeSection(
    document: PDFKit.PDFDocument,
    title: string,
    body: string,
    positionY: number,
): number {
    drawSectionTitle(document, title, positionY);
    const bodyY = positionY + 22;
    const bodyHeight = document.heightOfString(body, {
        width: document.page.width - 92,
        lineGap: 2.2,
    });
    document
        .fillColor(colors.text)
        .font("Helvetica")
        .fontSize(9.2)
        .text(body, 46, bodyY, {
            width: document.page.width - 92,
            lineGap: 2.2,
            align: "justify",
        });
    return bodyY + bodyHeight;
}

function drawSectionTitle(
    document: PDFKit.PDFDocument,
    title: string,
    positionY: number,
): void {
    document.rect(46, positionY + 2, 3, 13).fill(colors.teal);
    document
        .fillColor(colors.navy)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(title, 57, positionY, {
            characterSpacing: 0.25,
        });
}

function drawAttentionPanel(
    document: PDFKit.PDFDocument,
    text: string,
    positionY: number,
): number {
    const panelWidth = document.page.width - 92;
    const textHeight = document.heightOfString(text, {
        width: panelWidth - 34,
        lineGap: 2,
    });
    const panelHeight = Math.max(54, textHeight + 31);
    document
        .roundedRect(46, positionY, panelWidth, panelHeight, 5)
        .fill(colors.navy);
    document
        .fillColor("#A9C4D8")
        .font("Helvetica-Bold")
        .fontSize(7)
        .text("MANAGEMENT ATTENTION", 62, positionY + 11, {
            characterSpacing: 1,
        });
    document
        .fillColor(colors.white)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(text, 62, positionY + 27, {
            width: panelWidth - 34,
            lineGap: 2,
        });
    return positionY + panelHeight;
}

function drawPriorityIssues(
    document: PDFKit.PDFDocument,
    issues: readonly ExecutivePriorityIssue[],
    positionY: number,
): void {
    drawSectionTitle(document, "Priority Maintenance Issues", positionY);
    const tableY = positionY + 24;
    const columns = [
        { label: "ASSET", width: 174 },
        { label: "ERROR", width: 52 },
        { label: "SEVERITY", width: 65 },
        { label: "REQUIRED PART", width: 158 },
        { label: "COUNT", width: 54 },
    ];
    drawTableHeader(document, columns, tableY);

    if (issues.length === 0) {
        document
            .fillColor(colors.muted)
            .font("Helvetica")
            .fontSize(8.5)
            .text("No priority maintenance issues were identified.", 54, tableY + 31);
        return;
    }

    issues.slice(0, 3).forEach((issue, index) => {
        const rowY = tableY + 26 + index * 35;
        if (index % 2 === 1) {
            document
                .rect(46, rowY, document.page.width - 92, 35)
                .fill(colors.panel);
        }
        drawTableRow(
            document,
            [
                issue.asset,
                issue.errorCode,
                issue.severity,
                issue.part,
                String(issue.findingCount),
            ],
            columns,
            rowY,
            35,
        );
    });
}

function drawVendorPositions(
    document: PDFKit.PDFDocument,
    vendors: readonly ExecutiveVendorPosition[],
    positionY: number,
): number {
    drawSectionTitle(document, "Vendor Position", positionY);
    const tableY = positionY + 24;
    const columns = [
        { label: "VENDOR", width: 105 },
        { label: "PO VALUE", width: 128 },
        { label: "DELIVERY", width: 105 },
        { label: "EMAIL STATUS", width: 165 },
    ];
    drawTableHeader(document, columns, tableY);

    if (vendors.length === 0) {
        document
            .fillColor(colors.muted)
            .font("Helvetica")
            .fontSize(8.5)
            .text("No vendor positions were generated.", 54, tableY + 31);
        return tableY + 64;
    }

    vendors.slice(0, 5).forEach((vendor, index) => {
        const rowY = tableY + 26 + index * 31;
        if (index % 2 === 1) {
            document
                .rect(46, rowY, document.page.width - 92, 31)
                .fill(colors.panel);
        }
        drawTableRow(
            document,
            [
                vendor.vendor,
                formatInr(vendor.amountInr),
                vendor.deliveryTime,
                vendor.deliveryStatus,
            ],
            columns,
            rowY,
            31,
        );
    });
    return tableY + 26 + Math.max(1, Math.min(vendors.length, 5)) * 31;
}

function drawManagementActions(
    document: PDFKit.PDFDocument,
    actions: ExecutiveReportContent["managementActions"],
    positionY: number,
): number {
    drawSectionTitle(document, "Management Actions", positionY);
    let rowY = positionY + 24;

    actions.forEach((item, index) => {
        const cardHeight = 57;
        document
            .roundedRect(46, rowY, document.page.width - 92, cardHeight, 4)
            .fillAndStroke(index % 2 === 0 ? colors.panel : colors.white, colors.border);
        document
            .roundedRect(57, rowY + 10, 86, 17, 3)
            .fill(ownerColor(item.owner));
        document
            .fillColor(colors.white)
            .font("Helvetica-Bold")
            .fontSize(7)
            .text(item.owner.toUpperCase(), 62, rowY + 15, {
                width: 76,
                align: "center",
            });
        document
            .fillColor(colors.text)
            .font("Helvetica-Bold")
            .fontSize(8.7)
            .text(`${index + 1}. ${item.action}`, 156, rowY + 9, {
                width: 381,
                lineGap: 1,
            });
        document
            .fillColor(colors.muted)
            .font("Helvetica")
            .fontSize(7.6)
            .text(`Basis: ${item.rationale}`, 57, rowY + 34, {
                width: 480,
                lineGap: 1,
            });
        rowY += cardHeight + 7;
    });
    return rowY;
}

function drawConclusion(
    document: PDFKit.PDFDocument,
    text: string,
    positionY: number,
): void {
    drawSectionTitle(document, "Management Conclusion", positionY);
    document
        .fillColor(colors.text)
        .font("Helvetica")
        .fontSize(9.2)
        .text(text, 46, positionY + 22, {
            width: document.page.width - 92,
            lineGap: 2.2,
            align: "justify",
        });
}

function drawTableHeader(
    document: PDFKit.PDFDocument,
    columns: readonly { readonly label: string; readonly width: number }[],
    positionY: number,
): void {
    document
        .rect(46, positionY, document.page.width - 92, 26)
        .fill(colors.navyLight);
    let positionX = 46;
    columns.forEach((column) => {
        document
            .fillColor(colors.white)
            .font("Helvetica-Bold")
            .fontSize(6.8)
            .text(column.label, positionX + 8, positionY + 9, {
                width: column.width - 16,
                characterSpacing: 0.4,
            });
        positionX += column.width;
    });
}

function drawTableRow(
    document: PDFKit.PDFDocument,
    values: readonly string[],
    columns: readonly { readonly width: number }[],
    positionY: number,
    rowHeight: number,
): void {
    let positionX = 46;
    columns.forEach((column, index) => {
        document
            .fillColor(colors.text)
            .font(index === 0 ? "Helvetica-Bold" : "Helvetica")
            .fontSize(7.4)
            .text(values[index] ?? "", positionX + 8, positionY + 8, {
                width: column.width - 16,
                height: rowHeight - 12,
                ellipsis: true,
                lineGap: 1,
            });
        positionX += column.width;
    });
}

function drawPageFooters(
    document: PDFKit.PDFDocument,
    workflowId: string,
): void {
    const pages = document.bufferedPageRange();
    for (
        let pageIndex = pages.start;
        pageIndex < pages.start + pages.count;
        pageIndex += 1
    ) {
        document.switchToPage(pageIndex);
        const footerY =
            document.page.height - document.page.margins.bottom - 16;
        document
            .strokeColor(colors.border)
            .lineWidth(0.5)
            .moveTo(46, footerY - 8)
            .lineTo(document.page.width - 46, footerY - 8)
            .stroke();
        document
            .fillColor(colors.muted)
            .font("Helvetica")
            .fontSize(6.8)
            .text(`CONFIDENTIAL  •  ${workflowId}`, 46, footerY, {
                width: 360,
                lineBreak: false,
            });
        document.text(
            `PAGE ${pageIndex - pages.start + 1} OF ${pages.count}`,
            document.page.width - 150,
            footerY,
            {
                width: 104,
                align: "right",
                lineBreak: false,
            },
        );
    }
}

function ownerColor(
    owner: ExecutiveReportContent["managementActions"][number]["owner"],
): string {
    if (owner === "Maintenance") {
        return colors.red;
    }
    if (owner === "Procurement") {
        return colors.amber;
    }
    return colors.teal;
}

function formatInr(value: number): string {
    return `INR ${value.toLocaleString("en-IN", {
        maximumFractionDigits: 0,
    })}`;
}

function formatGeneratedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
    });
}
