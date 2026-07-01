import { Router } from "express";
import multer from "multer";
import { validate } from "../http/validate";
import {
    createWorkflowBodySchema,
    workflowParamsSchema,
} from "../schemas/workflows.schema";
import { makeWorkflowsController } from "../controllers/workflows.controller";
import type { WorkflowsService } from "../services/workflows.service";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 3,
    },
});

/**
 * Wires workflow routes, upload handling, request validation, and controllers.
 */
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
        validate({ body: createWorkflowBodySchema }),
        controller.create,
    );

    router.get(
        "/:id",
        validate({ params: workflowParamsSchema }),
        controller.get,
    );
    return router;
}
