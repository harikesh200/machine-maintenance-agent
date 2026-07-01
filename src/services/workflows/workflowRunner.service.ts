import { logger } from "../../logger";
import type { WorkflowsRepository } from "../../repositories/memoryWorkflow.repository";
import type {
    RuntimeWorkflowInput,
    WorkflowJob,
    WorkflowRunningStep,
} from "../../types/workflows.types";
import type { ReportService } from "../openai-report.service";
import type { EmailService } from "../smtp-email.service";
import { runLogAnalysis } from "./logAnalysis.service";
import { runPurchaseOrders } from "./purchaseOrders.service";
import { runSummaryReport } from "./summaryReport.service";
import { sendPlantHeadReport, sendVendorEmails } from "./workflowEmails.service";

type WorkflowRunnerDeps = {
    readonly workflowsRepository: WorkflowsRepository;
    readonly reportService: ReportService;
    readonly emailService: EmailService;
};

/**
 * Executes the asynchronous workflow entirely in memory.
 */
export async function runWorkflow(
    deps: WorkflowRunnerDeps,
    jobId: string,
    runtime: RuntimeWorkflowInput,
): Promise<void> {
    let job = await advance(deps, jobId, "uploads_saved", 5);
    try {
        job = await advance(deps, job.id, "log_analysis", 20);
        const agent1Rows = await runLogAnalysis({
            errorManual: runtime.files.errorManual,
            machineLogs: runtime.files.machineLogs,
        });

        job = await advance(deps, job.id, "purchase_orders", 45);
        const purchaseOrders = runPurchaseOrders({
            vendorCatalog: runtime.files.vendorCatalog,
            agent1Rows,
        });

        job = await advance(deps, job.id, "vendor_emails", 65);
        const emailResult = await sendVendorEmails({
            emailService: deps.emailService,
            invoices: purchaseOrders.invoices,
            invoiceVendors: purchaseOrders.invoiceVendors,
            senderEmail: job.senderEmail,
            senderPassword: runtime.senderPassword,
            vendorEmailList: job.vendorEmailList,
        });
        job = await deps.workflowsRepository.update({
            ...job,
            resolvedVendorEmails: emailResult.resolvedVendorEmails,
        });

        job = await advance(deps, job.id, "summary_report", 85);
        const executiveReport = await runSummaryReport({
            reportService: deps.reportService,
            workflowId: job.id,
            agent1Rows,
            errorPartVendorRows: purchaseOrders.errorPartVendorRows,
            emailStatus: emailResult.emailStatus,
        });

        job = await advance(deps, job.id, "plant_head_email", 95);
        await sendPlantHeadReport({
            emailService: deps.emailService,
            senderEmail: job.senderEmail,
            senderPassword: runtime.senderPassword,
            plantHeadEmail: job.plantHeadEmail,
            report: executiveReport,
        });

        await markSucceeded(deps, job);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Workflow failed";
        logger.error({ err, workflowId: jobId }, "Workflow execution failed");
        await markFailed(deps, jobId, message);
    }
}

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

async function markSucceeded(
    deps: WorkflowRunnerDeps,
    current: WorkflowJob,
): Promise<WorkflowJob> {
    const next: WorkflowJob = {
        ...current,
        status: "succeeded",
        currentStep: "completed",
        progress: 100,
        error: null,
        completedAt: new Date().toISOString(),
    };
    return deps.workflowsRepository.update(next);
}

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
