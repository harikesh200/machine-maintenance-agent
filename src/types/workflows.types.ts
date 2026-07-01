import * as z from "zod";

/**
 * Persisted lifecycle status for a workflow job.
 */
export const workflowStatusSchema = z.enum([
    "queued",
    "running",
    "succeeded",
    "failed",
]);

/**
 * Execution steps that can only occur while a workflow job is running.
 */
export const workflowRunningStepSchema = z.enum([
    "uploads_saved",
    "log_analysis",
    "purchase_orders",
    "vendor_emails",
    "summary_report",
    "plant_head_email",
]);

/**
 * Fine-grained execution step used for progress reporting.
 */
export const workflowStepSchema = z.enum([
    "queued",
    "uploads_saved",
    "log_analysis",
    "purchase_orders",
    "vendor_emails",
    "summary_report",
    "plant_head_email",
    "completed",
    "failed",
]);

/**
 * Workflow job schema used to validate in-memory state.
 */
const workflowJobBaseSchema = z.object({
    id: z.string().min(1),
    senderEmail: z.email(),
    vendorEmailList: z.array(z.email()),
    resolvedVendorEmails: z.record(z.string(), z.email()),
    plantHeadEmail: z.email(),
    progress: z.number().int().min(0).max(100),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
});

const queuedJobSchema = workflowJobBaseSchema.extend({
    status: z.literal("queued"),
    currentStep: z.literal("queued"),
    error: z.null(),
    completedAt: z.null(),
});

const runningJobSchema = workflowJobBaseSchema.extend({
    status: z.literal("running"),
    currentStep: workflowRunningStepSchema,
    error: z.null(),
    completedAt: z.null(),
});

const succeededJobSchema = workflowJobBaseSchema.extend({
    status: z.literal("succeeded"),
    currentStep: z.literal("completed"),
    error: z.null(),
    completedAt: z.iso.datetime(),
});

const failedJobSchema = workflowJobBaseSchema.extend({
    status: z.literal("failed"),
    currentStep: z.literal("failed"),
    error: z.string().min(1),
    completedAt: z.iso.datetime(),
});

/**
 * Persisted workflow job schema.
 *
 * The job status determines valid step, error, and completion timestamp
 * combinations, so impossible terminal states are rejected at the boundary.
 */
export const workflowJobSchema = z.discriminatedUnion("status", [
    queuedJobSchema,
    runningJobSchema,
    succeededJobSchema,
    failedJobSchema,
]);

/**
 * Persisted lifecycle status for a workflow job.
 */
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;

/**
 * Fine-grained execution step used for progress reporting.
 */
export type WorkflowStep = z.infer<typeof workflowStepSchema>;

/**
 * Execution step allowed while a workflow job is running.
 */
export type WorkflowRunningStep = z.infer<typeof workflowRunningStepSchema>;

/**
 * In-memory workflow job state.
 */
export type WorkflowJob = z.infer<typeof workflowJobSchema>;

/**
 * Required in-memory file buffers for workflow creation.
 */
export type UploadedWorkflowFiles = {
    readonly machineLogs: Buffer;
    readonly errorManual: Buffer;
    readonly vendorCatalog: Buffer;
};

/**
 * Runtime-only input needed by the background workflow runner.
 */
export type RuntimeWorkflowInput = {
    readonly senderPassword: string;
    readonly files: UploadedWorkflowFiles;
};
