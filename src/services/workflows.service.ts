import { randomUUID } from "node:crypto";
import type { WorkflowsRepository } from "../repositories/memoryWorkflow.repository";
import type { CreateWorkflowInput } from "../types/workflows.domain";
import type { WorkflowJob } from "../types/workflows.types";
import type { EmailService } from "./smtp-email.service";
import type { ReportService } from "./openai-report.service";
import { runWorkflow } from "./workflows/workflowRunner.service";

/**
 * Public workflow application service used by the HTTP layer.
 */
export type WorkflowsService = ReturnType<typeof createWorkflowsService>;

/**
 * Creates jobs, dispatches in-memory workflow execution, and projects public
 * status responses.
 */
export function createWorkflowsService(deps: {
    readonly workflowsRepository: WorkflowsRepository;
    readonly reportService: ReportService;
    readonly emailService: EmailService;
}) {
    return {
        async createWorkflow(input: CreateWorkflowInput): Promise<WorkflowJob> {
            const id = `wf_${randomUUID()}`;
            const createdAt = new Date().toISOString();
            const job: WorkflowJob = {
                id,
                status: "queued",
                currentStep: "queued",
                progress: 0,
                senderEmail: input.input.senderEmail,
                vendorEmailList: [...input.input.vendorEmailList],
                resolvedVendorEmails: {},
                plantHeadEmail: input.input.plantHeadEmail,
                error: null,
                createdAt,
                updatedAt: createdAt,
                completedAt: null,
            };

            await deps.workflowsRepository.create(job);
            queueMicrotask(() => {
                void runWorkflow(deps, id, {
                    senderPassword: input.input.senderPassword,
                    files: input.files,
                });
            });
            return job;
        },

        async getWorkflow(id: string): Promise<WorkflowJob> {
            return deps.workflowsRepository.get(id);
        },

        toPublicJob(job: WorkflowJob) {
            return {
                id: job.id,
                status: job.status,
                currentStep: job.currentStep,
                progress: job.progress,
                senderEmail: job.senderEmail,
                vendorEmailList: job.vendorEmailList,
                resolvedVendorEmails: job.resolvedVendorEmails,
                plantHeadEmail: job.plantHeadEmail,
                error: job.error,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt,
                completedAt: job.completedAt,
            };
        },
    };
}
