export type CreateWorkflowInput = {
    readonly files: import("./workflows.types").UploadedWorkflowFiles;
    readonly input: {
        readonly senderEmail: string;
        readonly senderPassword: string;
        readonly vendorEmailList: readonly string[];
        readonly plantHeadEmail: string;
    };
};

export type ErrorManualEntry = {
    readonly errorCode: string;
    readonly description: string;
    readonly possibleCauses: readonly string[];
    readonly recommendedParts: readonly string[];
    readonly severity: string;
};

export type Agent1OutputRow = {
    readonly timestamp: string;
    readonly machine_id: string;
    readonly machine_name: string;
    readonly error_code: string;
    readonly severity: string;
    readonly part_name: string;
};

export type ErrorPartVendorRow = Agent1OutputRow & {
    readonly vendor: string;
    readonly price: number;
    readonly delivery_time: string;
};

export type InvoiceLine = {
    readonly part_name: string;
    readonly quantity: number;
    readonly unit_price: number;
    readonly delivery_time: string;
    readonly subtotal: number;
    readonly total_vendor_cost: number;
};

export type SummaryRow = Agent1OutputRow & {
    readonly vendor: string;
    readonly price: string;
    readonly delivery_time: string;
    readonly vendor_email_status: string;
};
