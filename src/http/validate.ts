import type { RequestHandler } from "express";
import { ZodError, z, type ZodType } from "zod";
import { ValidationError } from "./errors";

type RequestSchemas = {
    readonly body?: ZodType;
    readonly params?: ZodType;
    readonly query?: ZodType;
};

export const validate =
    (schemas: RequestSchemas): RequestHandler =>
    (req, _res, next) => {
        try {
            if (schemas.body) {
                req.body = schemas.body.parse(req.body);
            }
            if (schemas.params) {
                Object.assign(req.params, schemas.params.parse(req.params));
            }
            if (schemas.query) {
                Object.assign(req.query, schemas.query.parse(req.query));
            }
            next();
        } catch (err) {
            if (err instanceof ZodError) {
                next(
                    new ValidationError("Invalid request", z.flattenError(err)),
                );
                return;
            }
            next(err);
        }
    };
