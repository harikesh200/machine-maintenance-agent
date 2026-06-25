import path from "node:path";
import { ValidationError } from "../../http/errors";
import { readCell, readCsvRows, writeCsv } from "../../utils/csvFiles";
import type {
    Agent1OutputRow,
    ErrorPartVendorRow,
    InvoiceLine,
} from "../../types/workflows.domain";
import type { WorkflowArtifact } from "../../types/workflows.types";
import { cleanPartName, groupBy, safeFilePart } from "../../utils/workflowUtils";

export async function runPurchaseOrders(input: {
    readonly artifactsDir: string;
    readonly vendorCatalogPath: string;
    readonly agent1Rows: readonly Agent1OutputRow[];
    readonly workflowId: string;
}): Promise<{
    readonly errorPartVendorRows: readonly ErrorPartVendorRow[];
    readonly invoiceFiles: ReadonlyMap<string, string>;
    readonly invoiceVendors: readonly string[];
    readonly artifacts: readonly WorkflowArtifact[];
}> {
    const vendorCatalog = await readCsvRows(input.vendorCatalogPath);
    const vendorsByPart = new Map<string, ErrorPartVendorRow[]>();

    for (const vendorRow of vendorCatalog) {
        const partName = cleanPartName(readCell(vendorRow, "part_name"));
        const vendor = readCell(vendorRow, "vendor");
        const price = Number(readCell(vendorRow, "price"));
        if (!Number.isFinite(price)) {
            throw new ValidationError(
                "Vendor catalog contains a non-numeric price",
            );
        }
        const deliveryTime = readCell(vendorRow, "delivery_time");
        const rows = vendorsByPart.get(partName) ?? [];
        rows.push({
            timestamp: "",
            machine_id: "",
            machine_name: "",
            error_code: "",
            severity: "",
            part_name: partName,
            vendor,
            price,
            delivery_time: deliveryTime,
        });
        vendorsByPart.set(partName, rows);
    }

    const errorPartVendorRows: ErrorPartVendorRow[] = [];
    for (const agentRow of input.agent1Rows) {
        const vendorRows =
            vendorsByPart.get(cleanPartName(agentRow.part_name)) ?? [];
        for (const vendorRow of vendorRows) {
            errorPartVendorRows.push({
                ...agentRow,
                vendor: vendorRow.vendor,
                price: vendorRow.price,
                delivery_time: vendorRow.delivery_time,
            });
        }
    }

    const invoiceVendors = Array.from(
        new Set(errorPartVendorRows.map((row) => row.vendor)),
    ).sort((left, right) => left.localeCompare(right));
    const invoiceFiles = new Map<string, string>();
    const artifacts: WorkflowArtifact[] = [];

    for (const vendor of invoiceVendors) {
        const vendorRows = errorPartVendorRows.filter(
            (row) => row.vendor === vendor,
        );
        const groupedByPart = groupBy(vendorRows, (row) => row.part_name);
        const invoiceLines: InvoiceLine[] = [];

        for (const [partName, partRows] of groupedByPart.entries()) {
            const firstRow = partRows[0];
            if (!firstRow) {
                continue;
            }
            const quantity = partRows.length;
            const subtotal = firstRow.price * quantity;
            invoiceLines.push({
                part_name: partName,
                quantity,
                unit_price: firstRow.price,
                delivery_time: firstRow.delivery_time,
                subtotal,
                total_vendor_cost: 0,
            });
        }

        const totalVendorCost = invoiceLines.reduce(
            (sum, line) => sum + line.subtotal,
            0,
        );
        const finalizedLines = invoiceLines.map((line) => ({
            ...line,
            total_vendor_cost: totalVendorCost,
        }));
        const invoicePath = path.join(
            input.artifactsDir,
            input.workflowId,
            `invoice_${safeFilePart(vendor)}.csv`,
        );
        await writeCsv(invoicePath, finalizedLines);
        invoiceFiles.set(vendor, invoicePath);
        artifacts.push({
            name: `invoice-${safeFilePart(vendor)}`,
            path: invoicePath,
            contentType: "text/csv",
        });
    }

    return { errorPartVendorRows, invoiceFiles, invoiceVendors, artifacts };
}
