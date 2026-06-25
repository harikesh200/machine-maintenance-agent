import type { ErrorRequestHandler } from "express";
import { ZodError, z } from "zod";
import { AppError, ValidationError } from "./errors";
import { logger } from "../logger";

export const errorHandler: ErrorRequestHandler = (
    err: unknown,
    req,
    res,
    _next,
) => {
    const log = req.log ?? logger;
    const error =
        err instanceof ZodError
            ? new ValidationError("Invalid request", z.flattenError(err))
            : err;

    if (error instanceof AppError && error.isOperational) {
        res.status(error.statusCode).json({
            error: {
                code: error.code,
                message: error.message,
                details: error.details,
            },
        });
        return;
    }

    log.error({ err: error }, "Unhandled request error");
    res.status(500).json({
        error: {
            code: "INTERNAL",
            message: "Internal server error",
            details: null,
        },
    });
};
