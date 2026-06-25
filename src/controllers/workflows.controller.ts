import path from "node:path";
import type { RequestHandler } from "express";
import { BadRequestError, NotFoundError } from "../http/errors";
import type { CreateWorkflowBody } from "../schemas/workflows.schema";
import type { UploadedWorkflowFiles } from "../types/workflows.types";
import type { WorkflowsService } from "../services/workflows.service";

const uploadFields = ["machineLogs", "errorManual", "vendorCatalog"] as const;
type UploadField = (typeof uploadFields)[number];

function pickUploadedFiles(files: unknown): UploadedWorkflowFiles {
    if (!files || typeof files !== "object" || Array.isArray(files)) {
        throw new BadRequestError("Workflow upload files are required");
    }

    const fileMap = files as Partial<
        Record<UploadField, readonly Express.Multer.File[]>
    >;
    const machineLogs = fileMap.machineLogs?.[0];
    const errorManual = fileMap.errorManual?.[0];
    const vendorCatalog = fileMap.vendorCatalog?.[0];

    if (!machineLogs || !errorManual || !vendorCatalog) {
        throw new BadRequestError(
            "machineLogs, errorManual, and vendorCatalog files are required",
        );
    }

    return { machineLogs, errorManual, vendorCatalog };
}

function requiredParam(value: string | string[] | undefined, name: string): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new BadRequestError(`${name} route parameter is required`);
    }
    return value;
}

export function makeWorkflowsController(service: WorkflowsService) {
    const create: RequestHandler = async (req, res) => {
        const body = req.body as CreateWorkflowBody;
        const files = pickUploadedFiles(req.files);
        const job = await service.createWorkflow({
            files,
            input: {
                senderEmail: body.senderEmail,
                senderPassword: body.senderPassword,
                vendorEmailList: body.vendorEmails,
                plantHeadEmail: body.plantHeadEmail,
            },
        });

        res.status(202).json({
            data: {
                id: job.id,
                status: job.status,
                currentStep: job.currentStep,
                progress: job.progress,
            },
        });
    };

    const get: RequestHandler = async (req, res) => {
        const job = await service.getWorkflow(requiredParam(req.params.id, "id"));
        res.json({ data: service.toPublicJob(job) });
    };

    const downloadArtifact: RequestHandler = async (req, res) => {
        const artifact = await service.getArtifact(
            requiredParam(req.params.id, "id"),
            requiredParam(req.params.name, "name"),
        );
        if (!path.isAbsolute(artifact.path)) {
            throw new NotFoundError("Artifact");
        }
        res.type(artifact.contentType);
        res.download(artifact.path, path.basename(artifact.path));
    };

    return { create, get, downloadArtifact };
}
