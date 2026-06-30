import path from "node:path";
import { logger } from "../../logger";
import type { EmailService } from "../../services/smtp-email.service";

/**
 * Sends generated purchase-order invoices to vendors by ordered email mapping.
 */
export async function sendVendorEmails(input: {
    readonly emailService: EmailService;
    readonly invoiceFiles: ReadonlyMap<string, string>;
    readonly invoiceVendors: readonly string[];
    readonly senderEmail: string;
    readonly senderPassword: string;
    readonly vendorEmailList: readonly string[];
}): Promise<{
    readonly resolvedVendorEmails: Record<string, string>;
    readonly emailStatus: Record<string, string>;
}> {
    const resolvedVendorEmails: Record<string, string> = {};
    const emailStatus: Record<string, string> = {};

    input.invoiceVendors.forEach((vendor, index) => {
        const email = input.vendorEmailList[index];
        if (email) {
            resolvedVendorEmails[vendor] = email;
        }
    });

    for (const vendor of input.invoiceVendors) {
        const invoicePath = input.invoiceFiles.get(vendor);
        if (!invoicePath) {
            continue;
        }
        const toEmail = resolvedVendorEmails[vendor];
        if (!toEmail) {
            emailStatus[vendor] = "no_email_configured";
            continue;
        }

        try {
            await input.emailService.send({
                senderEmail: input.senderEmail,
                senderPassword: input.senderPassword,
                toEmail,
                subject: `Purchase Order - ${vendor}`,
                body:
                    `Dear ${vendor} Team,\n\n` +
                    "Please find attached the purchase order for required spare parts.\n" +
                    "Kindly confirm availability and expected delivery schedule.\n\n" +
                    `Regards,\n${input.senderEmail}`,
                attachment: {
                    filename: path.basename(invoicePath),
                    path: invoicePath,
                    contentType: "text/csv",
                },
            });
            emailStatus[vendor] = "sent";
        } catch (err) {
            logger.warn({ err, vendor }, "Vendor email failed");
            emailStatus[vendor] = "failed";
        }
    }

    return { resolvedVendorEmails, emailStatus };
}

/**
 * Sends the final executive PDF report to the plant-head recipient.
 */
export async function sendPlantHeadReport(input: {
    readonly emailService: EmailService;
    readonly senderEmail: string;
    readonly senderPassword: string;
    readonly plantHeadEmail: string;
    readonly reportPath: string;
}): Promise<void> {
    try {
        await input.emailService.send({
            senderEmail: input.senderEmail,
            senderPassword: input.senderPassword,
            toEmail: input.plantHeadEmail,
            subject: "Plant Maintenance Executive Report",
            body:
                "Dear Sir/Madam,\n\n" +
                "Please find attached the latest plant maintenance executive report.\n\n" +
                "Regards,\nMaintenance Automation System",
            attachment: {
                filename: path.basename(input.reportPath),
                path: input.reportPath,
                contentType: "application/pdf",
            },
        });
    } catch (err) {
        logger.warn({ err }, "Plant head email failed");
        throw err;
    }
}
