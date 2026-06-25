import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NotFoundError } from "../http/errors";
import { workflowJobSchema, type WorkflowJob } from "../types/workflows.types";

export type WorkflowsRepository = ReturnType<
    typeof createLocalWorkflowRepository
>;

export function createLocalWorkflowRepository(options: {
    readonly jobsDir: string;
}) {
    const jobPath = (id: string) => path.join(options.jobsDir, `${id}.json`);

    return {
        async create(job: WorkflowJob): Promise<WorkflowJob> {
            await writeFile(
                jobPath(job.id),
                JSON.stringify(job, null, 2),
                "utf8",
            );
            return job;
        },

        async get(id: string): Promise<WorkflowJob> {
            try {
                const contents = await readFile(jobPath(id), "utf8");
                return workflowJobSchema.parse(JSON.parse(contents));
            } catch (err) {
                if (err instanceof SyntaxError) {
                    throw err;
                }
                throw new NotFoundError("Workflow");
            }
        },

        async update(job: WorkflowJob): Promise<WorkflowJob> {
            const updated = { ...job, updatedAt: new Date().toISOString() };
            await writeFile(
                jobPath(job.id),
                JSON.stringify(updated, null, 2),
                "utf8",
            );
            return updated;
        },
    };
}
