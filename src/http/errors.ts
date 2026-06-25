export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly code: string;
    public readonly details: unknown;

    public constructor(
        message: string,
        statusCode: number,
        code: string,
        details: unknown = null,
        isOperational = true,
    ) {
        super(message);
        this.name = new.target.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = isOperational;
        Error.captureStackTrace?.(this, new.target);
    }
}

export class ValidationError extends AppError {
    public constructor(message = "Invalid request", details: unknown = null) {
        super(message, 422, "VALIDATION_ERROR", details);
    }
}

export class NotFoundError extends AppError {
    public constructor(resource = "Resource") {
        super(`${resource} not found`, 404, "NOT_FOUND");
    }
}

export class BadRequestError extends AppError {
    public constructor(message = "Bad request", details: unknown = null) {
        super(message, 400, "BAD_REQUEST", details);
    }
}

export class UpstreamError extends AppError {
    public constructor(
        message = "Upstream service error",
        details: unknown = null,
    ) {
        super(message, 502, "UPSTREAM_ERROR", details);
    }
}
