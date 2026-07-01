import { NotFoundError } from "../http/errors";
import {
    workflowJobSchema,
    type WorkflowJob,
} from "../types/workflows.types";

/**
 * In-memory state boundary for active and recently completed jobs.
 */
export type WorkflowsRepository = ReturnType<
    typeof createMemoryWorkflowRepository
>;

/**
 * Stores job status in memory and expires terminal jobs after the configured
 * retention period.
 */
export function createMemoryWorkflowRepository(options: {
    readonly terminalRetentionMs: number;
}) {
    const jobs = new Map<string, WorkflowJob>();
    const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

    function store(job: WorkflowJob): WorkflowJob {
        const validated = workflowJobSchema.parse(structuredClone(job));
        jobs.set(validated.id, validated);

        const existingTimer = expiryTimers.get(validated.id);
        if (existingTimer) {
            clearTimeout(existingTimer);
            expiryTimers.delete(validated.id);
        }

        if (validated.status === "succeeded" || validated.status === "failed") {
            const timer = setTimeout(() => {
                jobs.delete(validated.id);
                expiryTimers.delete(validated.id);
            }, options.terminalRetentionMs);
            timer.unref();
            expiryTimers.set(validated.id, timer);
        }

        return structuredClone(validated);
    }

    return {
        async create(job: WorkflowJob): Promise<WorkflowJob> {
            return store(job);
        },

        async get(id: string): Promise<WorkflowJob> {
            const job = jobs.get(id);
            if (!job) {
                throw new NotFoundError("Workflow");
            }
            return structuredClone(job);
        },

        async update(job: WorkflowJob): Promise<WorkflowJob> {
            return store({
                ...job,
                updatedAt: new Date().toISOString(),
            });
        },
    };
}
