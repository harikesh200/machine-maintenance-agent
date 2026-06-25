import express from "express";
import helmet from "helmet";
import cors, { type CorsOptions } from "cors";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { config } from "./config/env";
import { errorHandler } from "./http/error-handler";
import { requestId } from "./http/request-id";
import { logger } from "./logger";
import { makeWorkflowsRouter } from "./routes/workflows.routes";
import type { WorkflowsService } from "./services/workflows.service";

export type AppDependencies = {
    readonly workflowsService: WorkflowsService;
};

function parseCorsOrigin(corsOrigin: string): CorsOptions["origin"] {
    const value = corsOrigin.trim();

    if (!value || value === "*") {
        return "*";
    }

    const origins = value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

    return origins.length === 1 ? origins[0] : origins;
}

export function buildApp(deps: AppDependencies): express.Express {
    const app = express();

    app.disable("x-powered-by");
    app.use(helmet());
    app.use(
        cors({
            origin: parseCorsOrigin(config.CORS_ORIGIN),
            credentials: true,
        }),
    );
    app.use(express.json({ limit: "100kb" }));
    app.use(express.urlencoded({ extended: false, limit: "100kb" }));
    app.use(rateLimit({ windowMs: 60_000, limit: 100 }));
    app.use(requestId);
    app.use(
        pinoHttp({
            logger,
            redact: [
                "req.headers.authorization",
                "req.headers.cookie",
                "req.body.senderPassword",
            ],
        }),
    );

    app.get("/health", (_req, res) => {
        res.json({ data: { status: "ok" } });
    });

    app.get("/ready", (_req, res) => {
        res.json({ data: { status: "ready" } });
    });

    app.use("/v1/workflows", makeWorkflowsRouter(deps.workflowsService));
    app.use(errorHandler);

    return app;
}
