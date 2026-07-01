import { createTransport } from "nodemailer";
import { UpstreamError } from "../http/errors";

/**
 * In-memory attachment sent with an SMTP message.
 */
export type EmailAttachment = {
    readonly filename: string;
    readonly content: Buffer;
    readonly contentType: string;
};

/**
 * SMTP delivery request used for vendor and plant-head emails.
 */
export type SendEmailInput = {
    readonly senderEmail: string;
    readonly senderPassword: string;
    readonly toEmail: string;
    readonly subject: string;
    readonly body: string;
    readonly attachment: EmailAttachment;
};

/**
 * Email delivery service boundary.
 */
export type EmailService = ReturnType<typeof createSmtpEmailService>;

/**
 * Creates the SMTP email service used by workflow email steps.
 */
export function createSmtpEmailService() {
    return {
        async send(input: SendEmailInput): Promise<void> {
            const transport = createTransport({
                host: "smtp.gmail.com",
                port: 587,
                secure: false,
                auth: {
                    user: input.senderEmail,
                    pass: input.senderPassword,
                },
            });

            try {
                await transport.sendMail({
                    from: input.senderEmail,
                    to: input.toEmail,
                    subject: input.subject,
                    text: input.body,
                    attachments: [
                        {
                            filename: input.attachment.filename,
                            content: input.attachment.content,
                            contentType: input.attachment.contentType,
                        },
                    ],
                });
            } catch {
                throw new UpstreamError("SMTP email delivery failed");
            } finally {
                transport.close();
            }
        },
    };
}
