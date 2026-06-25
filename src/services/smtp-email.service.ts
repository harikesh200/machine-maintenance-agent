import { createTransport } from "nodemailer";
import { UpstreamError } from "../http/errors";

export type EmailAttachment = {
    readonly filename: string;
    readonly path: string;
    readonly contentType: string;
};

export type SendEmailInput = {
    readonly senderEmail: string;
    readonly senderPassword: string;
    readonly toEmail: string;
    readonly subject: string;
    readonly body: string;
    readonly attachment: EmailAttachment;
};

export type EmailService = ReturnType<typeof createSmtpEmailService>;

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
                            path: input.attachment.path,
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
