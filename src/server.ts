import { buildApp } from "./app";
import { config } from "./config/env";
import { logger } from "./logger";
import { createOpenAiReportService } from "./services/openai-report.service";
import { createSmtpEmailService } from "./services/smtp-email.service";
import { createMemoryWorkflowRepository } from "./repositories/memoryWorkflow.repository";
import { createWorkflowsService } from "./services/workflows.service";

const workflowsRepository = createMemoryWorkflowRepository({
    terminalRetentionMs: config.JOB_RETENTION_MS,
});
const reportService = createOpenAiReportService({
    apiKey: config.OPENAI_API_KEY,
    model: config.OPENAI_MODEL,
});
const emailService = createSmtpEmailService();
const workflowsService = createWorkflowsService({
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
