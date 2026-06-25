import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logger } from "../logger";

export const requestId: RequestHandler = (req, res, next) => {
    const id = req.header("x-request-id") ?? randomUUID();
    req.log = logger.child({ requestId: id });
    res.setHeader("x-request-id", id);
    next();
};
