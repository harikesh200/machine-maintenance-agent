import type { RequestHandler } from "express";
import { BadRequestError } from "../http/errors";
import type { CreateWorkflowBody } from "../schemas/workflows.schema";
import type { UploadedWorkflowFiles } from "../types/workflows.types";
import type { WorkflowsService } from "../services/workflows.service";

const uploadFields = ["machineLogs", "errorManual", "vendorCatalog"] as const;
type UploadField = (typeof uploadFields)[number];
type UploadedFileMap = Partial<Record<UploadField, readonly unknown[]>>;

function isUploadedFileMap(files: unknown): files is UploadedFileMap {
    return Boolean(files) && typeof files === "object" && !Array.isArray(files);
}

function isUploadedFile(file: unknown): file is Express.Multer.File {
    return (
        file !== null &&
        typeof file === "object" &&
        "buffer" in file &&
        Buffer.isBuffer(file.buffer) &&
        file.buffer.length > 0
    );
}

function firstUploadedFile(
    files: UploadedFileMap,
    field: UploadField,
): Express.Multer.File | undefined {
    const candidates = files[field];
    if (!Array.isArray(candidates)) {
        return undefined;
    }
    return candidates.find(isUploadedFile);
}

function pickUploadedFiles(files: unknown): UploadedWorkflowFiles {
    if (!isUploadedFileMap(files)) {
        throw new BadRequestError("Workflow upload files are required");
    }

    const machineLogs = firstUploadedFile(files, "machineLogs");
    const errorManual = firstUploadedFile(files, "errorManual");
    const vendorCatalog = firstUploadedFile(files, "vendorCatalog");

    if (!machineLogs || !errorManual || !vendorCatalog) {
        throw new BadRequestError(
            "machineLogs, errorManual, and vendorCatalog files are required",
        );
    }

    return {
        machineLogs: machineLogs.buffer,
        errorManual: errorManual.buffer,
        vendorCatalog: vendorCatalog.buffer,
    };
}

function requiredParam(value: string | string[] | undefined, name: string): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new BadRequestError(`${name} route parameter is required`);
    }
    return value;
}

/**
 * Creates HTTP handlers for workflow creation and status lookup.
 */
export function makeWorkflowsController(service: WorkflowsService) {
    const create: RequestHandler<
        Record<string, never>,
        unknown,
        CreateWorkflowBody
    > = async (req, res) => {
        const body = req.body;
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

    return { create, get };
}
