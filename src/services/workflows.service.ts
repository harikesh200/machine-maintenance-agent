import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { BadRequestError, NotFoundError } from "../http/errors";
import type { EmailService } from "./smtp-email.service";
import type { ReportService } from "./openai-report.service";
import type { CreateWorkflowInput } from "../types/workflows.domain";
import { runWorkflow } from "./workflows/workflowRunner.service";
import type { WorkflowsRepository } from "../repositories/localWorkflow.repository";
import type { WorkflowArtifact, WorkflowJob } from "../types/workflows.types";

export type WorkflowsService = ReturnType<typeof createWorkflowsService>;

export function createWorkflowsService(deps: {
    readonly uploadsDir: string;
    readonly artifactsDir: string;
    readonly workflowsRepository: WorkflowsRepository;
    readonly reportService: ReportService;
    readonly emailService: EmailService;
}) {
    return {
        async createWorkflow(input: CreateWorkflowInput): Promise<WorkflowJob> {
            const id = `wf_${randomUUID()}`;
            const createdAt = new Date().toISOString();
            const uploadDir = path.join(deps.uploadsDir, id);
            const artifactDir = path.join(deps.artifactsDir, id);

            try {
                await Promise.all([
                    mkdir(uploadDir, { recursive: true }),
                    mkdir(artifactDir, { recursive: true }),
                ]);

                const job: WorkflowJob = {
                    id,
                    status: "queued",
                    currentStep: "queued",
                    progress: 0,
                    senderEmail: input.input.senderEmail,
                    vendorEmailList: [...input.input.vendorEmailList],
                    resolvedVendorEmails: {},
                    plantHeadEmail: input.input.plantHeadEmail,
                    uploadPaths: await moveWorkflowUploads(input, uploadDir),
                    artifacts: [],
                    error: null,
                    createdAt,
                    updatedAt: createdAt,
                    completedAt: null,
                };

                await deps.workflowsRepository.create(job);
                queueMicrotask(() => {
                    void runWorkflow(deps, id, {
                        senderPassword: input.input.senderPassword,
                    });
                });

                return job;
            } catch (err) {
                await Promise.allSettled([
                    rm(uploadDir, { recursive: true, force: true }),
                    rm(artifactDir, { recursive: true, force: true }),
                ]);
                throw err;
            }
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
                artifacts: job.artifacts.map((artifact) => ({
                    name: artifact.name,
                    contentType: artifact.contentType,
                })),
                error: job.error,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt,
                completedAt: job.completedAt,
            };
        },

        async getArtifact(id: string, name: string): Promise<WorkflowArtifact> {
            const job = await deps.workflowsRepository.get(id);
            const artifact = job.artifacts.find((item) => item.name === name);
            if (!artifact) {
                throw new NotFoundError("Artifact");
            }

            assertArtifactPath(deps.artifactsDir, id, artifact.path);
            return artifact;
        },
    };
}

async function moveWorkflowUploads(
    input: CreateWorkflowInput,
    uploadDir: string,
): Promise<WorkflowJob["uploadPaths"]> {
    return {
        machineLogs: await moveUpload(
            input.files.machineLogs,
            uploadDir,
            "machine_logs.csv",
        ),
        errorManual: await moveUpload(
            input.files.errorManual,
            uploadDir,
            "error_manual.pdf",
        ),
        vendorCatalog: await moveUpload(
            input.files.vendorCatalog,
            uploadDir,
            "vendor_catalog.csv",
        ),
    };
}

async function moveUpload(
    file: Express.Multer.File,
    destinationDir: string,
    destinationName: string,
): Promise<string> {
    const destinationPath = path.join(destinationDir, destinationName);
    await rename(file.path, destinationPath);
    return destinationPath;
}

function assertArtifactPath(
    artifactsDir: string,
    workflowId: string,
    artifactPath: string,
): void {
    const workflowArtifactDir = path.resolve(artifactsDir, workflowId);
    const resolvedArtifactPath = path.resolve(artifactPath);
    if (!resolvedArtifactPath.startsWith(workflowArtifactDir)) {
        throw new BadRequestError("Invalid artifact path");
    }
}
