import { logger } from "../../logger";
import type { EmailService } from "../smtp-email.service";
import type { ReportService } from "../openai-report.service";
import type { WorkflowsRepository } from "../../repositories/localWorkflow.repository";
import { runLogAnalysis } from "./logAnalysis.service";
import { runPurchaseOrders } from "./purchaseOrders.service";
import { runSummaryReport } from "./summaryReport.service";
import { sendPlantHeadReport, sendVendorEmails } from "./workflowEmails.service";
import type {
    RuntimeWorkflowSecrets,
    WorkflowArtifact,
    WorkflowJob,
    WorkflowRunningStep,
} from "../../types/workflows.types";

type WorkflowRunnerDeps = {
    readonly artifactsDir: string;
    readonly workflowsRepository: WorkflowsRepository;
    readonly reportService: ReportService;
    readonly emailService: EmailService;
};

/**
 * Executes the asynchronous workflow pipeline for a persisted job.
 *
 * The runner updates job progress between stages and marks the job failed if
 * any stage throws.
 */
export async function runWorkflow(
    deps: WorkflowRunnerDeps,
    jobId: string,
    secrets: RuntimeWorkflowSecrets,
): Promise<void> {
    let job = await advance(deps, jobId, "uploads_saved", 5);
    try {
        job = await advance(deps, job.id, "log_analysis", 20);
        const agent1 = await runLogAnalysis({
            artifactsDir: deps.artifactsDir,
            errorManualPath: job.uploadPaths.errorManual,
            machineLogsPath: job.uploadPaths.machineLogs,
            workflowId: job.id,
        });

        job = await advance(deps, job.id, "purchase_orders", 45);
        const purchaseOrders = await runPurchaseOrders({
            artifactsDir: deps.artifactsDir,
            vendorCatalogPath: job.uploadPaths.vendorCatalog,
            agent1Rows: agent1.rows,
            workflowId: job.id,
        });

        job = await advance(deps, job.id, "vendor_emails", 65);
        const emailResult = await sendVendorEmails({
            emailService: deps.emailService,
            invoiceFiles: purchaseOrders.invoiceFiles,
            invoiceVendors: purchaseOrders.invoiceVendors,
            senderEmail: job.senderEmail,
            senderPassword: secrets.senderPassword,
            vendorEmailList: job.vendorEmailList,
        });
        job = await deps.workflowsRepository.update({
            ...job,
            resolvedVendorEmails: emailResult.resolvedVendorEmails,
        });

        job = await advance(deps, job.id, "summary_report", 85);
        const summary = await runSummaryReport({
            artifactsDir: deps.artifactsDir,
            reportService: deps.reportService,
            workflowId: job.id,
            agent1Rows: agent1.rows,
            errorPartVendorRows: purchaseOrders.errorPartVendorRows,
            emailStatus: emailResult.emailStatus,
        });
        const artifacts: WorkflowArtifact[] = [
            agent1.artifact,
            ...purchaseOrders.artifacts,
            summary.tabularArtifact,
            summary.executiveReportArtifact,
        ];
        job = await deps.workflowsRepository.update({ ...job, artifacts });

        job = await advance(deps, job.id, "plant_head_email", 95);
        await sendPlantHeadReport({
            emailService: deps.emailService,
            senderEmail: job.senderEmail,
            senderPassword: secrets.senderPassword,
            plantHeadEmail: job.plantHeadEmail,
            reportPath: summary.executiveReportPath,
        });

        await markSucceeded(deps, job, artifacts);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Workflow failed";
        logger.error({ err, workflowId: jobId }, "Workflow execution failed");
        await markFailed(deps, jobId, message);
    }
}

/**
 * Advances a persisted job to a running step.
 *
 * The latest job is re-read before each transition so updates written between
 * steps are not lost.
 */
async function advance(
    deps: WorkflowRunnerDeps,
    jobId: string,
    step: WorkflowRunningStep,
    progress: number,
): Promise<WorkflowJob> {
    const current = await deps.workflowsRepository.get(jobId);
    const next: WorkflowJob = {
        ...current,
        status: "running",
        currentStep: step,
        progress,
        error: null,
        completedAt: null,
    };
    return deps.workflowsRepository.update(next);
}

/**
 * Marks a workflow job as successfully completed.
 */
async function markSucceeded(
    deps: WorkflowRunnerDeps,
    current: WorkflowJob,
    artifacts: WorkflowArtifact[],
): Promise<WorkflowJob> {
    const next: WorkflowJob = {
        ...current,
        status: "succeeded",
        currentStep: "completed",
        progress: 100,
        artifacts,
        error: null,
        completedAt: new Date().toISOString(),
    };
    return deps.workflowsRepository.update(next);
}

/**
 * Marks a workflow job as failed while preserving the latest persisted fields.
 */
async function markFailed(
    deps: WorkflowRunnerDeps,
    jobId: string,
    message: string,
): Promise<WorkflowJob> {
    const current = await deps.workflowsRepository.get(jobId);
    const next: WorkflowJob = {
        ...current,
        status: "failed",
        currentStep: "failed",
        error: message,
        completedAt: new Date().toISOString(),
    };
    return deps.workflowsRepository.update(next);
}
