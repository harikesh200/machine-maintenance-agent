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

export const createWorkflowBodySchema = z.object({
    senderEmail: z.email(),
    senderPassword: z.string().min(1),
    vendorEmails: vendorEmailsFieldSchema,
    plantHeadEmail: z.email(),
});

export const workflowParamsSchema = z.object({
    id: z.string().min(1),
});

export const artifactParamsSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
});

export type CreateWorkflowBody = z.infer<typeof createWorkflowBodySchema>;
