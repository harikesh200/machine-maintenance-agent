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
    WorkflowJob,
    WorkflowStep,
} from "../../types/workflows.types";

type WorkflowRunnerDeps = {
    readonly artifactsDir: string;
    readonly workflowsRepository: WorkflowsRepository;
    readonly reportService: ReportService;
    readonly emailService: EmailService;
};

export async function runWorkflow(
    deps: WorkflowRunnerDeps,
    jobId: string,
    secrets: RuntimeWorkflowSecrets,
): Promise<void> {
    let job = await setStep(deps, jobId, "uploads_saved", 5);
    try {
        job = await setStep(deps, job.id, "log_analysis", 20);
        const agent1 = await runLogAnalysis({
            artifactsDir: deps.artifactsDir,
            errorManualPath: job.uploadPaths.errorManual,
            machineLogsPath: job.uploadPaths.machineLogs,
            workflowId: job.id,
        });

        job = await setStep(deps, job.id, "purchase_orders", 45);
        const purchaseOrders = await runPurchaseOrders({
            artifactsDir: deps.artifactsDir,
            vendorCatalogPath: job.uploadPaths.vendorCatalog,
            agent1Rows: agent1.rows,
            workflowId: job.id,
        });

        job = await setStep(deps, job.id, "vendor_emails", 65);
        const emailResult = await sendVendorEmails({
            emailService: deps.emailService,
            invoiceFiles: purchaseOrders.invoiceFiles,
            invoiceVendors: purchaseOrders.invoiceVendors,
            senderEmail: job.senderEmail,
            senderPassword: secrets.senderPassword,
            vendorEmailList: job.vendorEmailList,
        });
        job = await updateJob(deps, job, {
            resolvedVendorEmails: emailResult.resolvedVendorEmails,
        });

        job = await setStep(deps, job.id, "summary_report", 85);
        const summary = await runSummaryReport({
            artifactsDir: deps.artifactsDir,
            reportService: deps.reportService,
            workflowId: job.id,
            agent1Rows: agent1.rows,
            errorPartVendorRows: purchaseOrders.errorPartVendorRows,
            emailStatus: emailResult.emailStatus,
        });
        const artifacts = [
            agent1.artifact,
            ...purchaseOrders.artifacts,
            summary.tabularArtifact,
            summary.textArtifact,
        ];
        job = await updateJob(deps, job, { artifacts });

        job = await setStep(deps, job.id, "plant_head_email", 95);
        await sendPlantHeadReport({
            emailService: deps.emailService,
            senderEmail: job.senderEmail,
            senderPassword: secrets.senderPassword,
            plantHeadEmail: job.plantHeadEmail,
            textReportPath: summary.textSummaryPath,
        });

        await updateJob(deps, job, {
            status: "succeeded",
            currentStep: "completed",
            progress: 100,
            artifacts,
            error: null,
            completedAt: new Date().toISOString(),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Workflow failed";
        logger.error({ err, workflowId: jobId }, "Workflow execution failed");
        const latest = await deps.workflowsRepository.get(jobId);
        await updateJob(deps, latest, {
            status: "failed",
            currentStep: "failed",
            error: message,
            completedAt: new Date().toISOString(),
        });
    }
}

async function updateJob(
    deps: WorkflowRunnerDeps,
    current: WorkflowJob,
    patch: Partial<
        Pick<
            WorkflowJob,
            | "status"
            | "currentStep"
            | "progress"
            | "artifacts"
            | "resolvedVendorEmails"
            | "error"
            | "completedAt"
        >
    >,
): Promise<WorkflowJob> {
    return deps.workflowsRepository.update({
        ...current,
        ...patch,
    });
}

async function setStep(
    deps: WorkflowRunnerDeps,
    jobId: string,
    step: WorkflowStep,
    progress: number,
): Promise<WorkflowJob> {
    const job = await deps.workflowsRepository.get(jobId);
    return updateJob(deps, job, {
        status: "running",
        currentStep: step,
        progress,
    });
}
