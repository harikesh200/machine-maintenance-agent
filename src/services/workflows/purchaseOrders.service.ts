import * as z from "zod";
import { createCsvBuffer, parseCsvRows } from "../../utils/csvFiles";
import type {
    Agent1OutputRow,
    ErrorPartVendorRow,
    InvoiceLine,
} from "../../types/workflows.domain";
import { cleanPartName, groupBy, safeFilePart } from "../../utils/workflowUtils";

const vendorCatalogRowSchema = z.object({
    part_name: z.string().trim().min(1),
    vendor: z.string().trim().min(1),
    delivery_time: z.string().trim().min(1),
    price: z.string().trim().min(1).transform((value, ctx) => {
        const price = Number(value);
        if (!Number.isFinite(price)) {
            ctx.addIssue({
                code: "custom",
                message: "price must be numeric",
            });
            return z.NEVER;
        }
        return price;
    }),
});

export type GeneratedInvoice = {
    readonly filename: string;
    readonly content: Buffer;
};

/**
 * Matches recommended parts to vendors and builds invoice CSV buffers.
 */
export function runPurchaseOrders(input: {
    readonly vendorCatalog: Buffer;
    readonly agent1Rows: readonly Agent1OutputRow[];
}): {
    readonly errorPartVendorRows: readonly ErrorPartVendorRow[];
    readonly invoiceVendors: readonly string[];
    readonly invoices: ReadonlyMap<string, GeneratedInvoice>;
} {
    const vendorCatalog = parseCsvRows(
        input.vendorCatalog,
        vendorCatalogRowSchema,
    );
    const vendorsByPart = new Map<
        string,
        {
            readonly vendor: string;
            readonly price: number;
            readonly delivery_time: string;
        }[]
    >();

    for (const vendorRow of vendorCatalog) {
        const partName = cleanPartName(vendorRow.part_name);
        const rows = vendorsByPart.get(partName) ?? [];
        rows.push({
            vendor: vendorRow.vendor,
            price: vendorRow.price,
            delivery_time: vendorRow.delivery_time,
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
    const invoices = new Map<string, GeneratedInvoice>();

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
        invoices.set(vendor, {
            filename: `invoice_${safeFilePart(vendor)}.csv`,
            content: createCsvBuffer(finalizedLines),
        });
    }

    return { errorPartVendorRows, invoiceVendors, invoices };
}
