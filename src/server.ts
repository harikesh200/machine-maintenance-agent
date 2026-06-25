import { mkdir } from "node:fs/promises";
import { artifactsDir, jobsDir, uploadsDir } from "./config/paths";
import { buildApp } from "./app";
import { config } from "./config/env";
import { logger } from "./logger";
import { createOpenAiReportService } from "./services/openai-report.service";
import { createSmtpEmailService } from "./services/smtp-email.service";
import { createLocalWorkflowRepository } from "./repositories/localWorkflow.repository";
import { createWorkflowsService } from "./services/workflows.service";

await Promise.all([
    mkdir(uploadsDir, { recursive: true }),
    mkdir(artifactsDir, { recursive: true }),
    mkdir(jobsDir, { recursive: true }),
]);

const workflowsRepository = createLocalWorkflowRepository({ jobsDir });
const reportService = createOpenAiReportService({
    apiKey: config.OPENAI_API_KEY,
    model: config.OPENAI_MODEL,
});
const emailService = createSmtpEmailService();
const workflowsService = createWorkflowsService({
    artifactsDir,
    uploadsDir,
    workflowsRepository,
    reportService,
    emailService,
});
const app = buildApp({ workflowsService });
const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "Maintenance workflow backend started");
});

function shutdown(code = 0): void {
    logger.info("Shutting down");
    server.close(() => {
        process.exit(code);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));
process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandledRejection");
});
process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaughtException");
    shutdown(1);
});
