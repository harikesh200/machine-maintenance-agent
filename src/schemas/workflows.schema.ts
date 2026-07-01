import * as z from "zod";

const vendorEmailsFieldSchema = z
    .string()
    .min(1)
    .transform((value, ctx) => {
        try {
            const parsed: unknown = JSON.parse(value);
            return z.array(z.email()).parse(parsed);
        } catch {
            ctx.addIssue({
                code: "custom",
                message: "vendorEmails must be a JSON array of email addresses",
            });
            return z.NEVER;
        }
    });

/**
 * Multipart body schema for creating a workflow.
 *
 * The `vendorEmails` field arrives as a JSON string and is transformed into an
 * ordered email list for vendor-to-email resolution.
 */
export const createWorkflowBodySchema = z.object({
    senderEmail: z.email(),
    senderPassword: z.string().min(1),
    vendorEmails: vendorEmailsFieldSchema,
    plantHeadEmail: z.email(),
});

/**
 * Route parameter schema for workflow lookup.
 */
export const workflowParamsSchema = z.object({
    id: z.string().min(1),
});

/**
 * Validated request body for workflow creation.
 */
export type CreateWorkflowBody = z.infer<typeof createWorkflowBodySchema>;
