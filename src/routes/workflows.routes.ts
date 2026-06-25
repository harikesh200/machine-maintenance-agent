import { Router } from "express";
import multer from "multer";
import { uploadsDir } from "../config/paths";
import { cleanupUploadedFilesOnError } from "../http/cleanup-uploaded-files";
import { validate } from "../http/validate";
import {
    artifactParamsSchema,
    createWorkflowBodySchema,
    workflowParamsSchema,
} from "../schemas/workflows.schema";
import { makeWorkflowsController } from "../controllers/workflows.controller";
import type { WorkflowsService } from "../services/workflows.service";

const upload = multer({
    dest: uploadsDir,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 3,
    },
});

export function makeWorkflowsRouter(service: WorkflowsService): Router {
    const router = Router();
    const controller = makeWorkflowsController(service);

    router.post(
        "/",
        upload.fields([
            { name: "machineLogs", maxCount: 1 },
            { name: "errorManual", maxCount: 1 },
            { name: "vendorCatalog", maxCount: 1 },
        ]),
        cleanupUploadedFilesOnError,
        validate({ body: createWorkflowBodySchema }),
        controller.create,
    );

    router.get(
        "/:id",
        validate({ params: workflowParamsSchema }),
        controller.get,
    );
    router.get(
        "/:id/artifacts/:name",
        validate({ params: artifactParamsSchema }),
        controller.downloadArtifact,
    );

    return router;
}
