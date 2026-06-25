import { unlink } from "node:fs/promises";
import type { RequestHandler } from "express";
import { logger } from "../logger";

function uploadedFilePaths(files: unknown): string[] {
    if (!files) {
        return [];
    }

    if (Array.isArray(files)) {
        return files
            .map((file: Express.Multer.File) => file.path)
            .filter((filePath) => filePath.length > 0);
    }

    if (typeof files !== "object") {
        return [];
    }

    return Object.values(files)
        .flatMap((value) => (Array.isArray(value) ? value : []))
        .map((file: Express.Multer.File) => file.path)
        .filter((filePath) => filePath.length > 0);
}

export const cleanupUploadedFilesOnError: RequestHandler = (req, res, next) => {
    const filePaths = uploadedFilePaths(req.files);

    if (filePaths.length === 0) {
        next();
        return;
    }

    res.once("finish", () => {
        if (res.statusCode < 400) {
            return;
        }

        void Promise.allSettled(
            filePaths.map((filePath) => unlink(filePath)),
        ).then((results) => {
            const failedCount = results.filter(
                (result) => result.status === "rejected",
            ).length;

            if (failedCount > 0) {
                logger.warn(
                    { failedCount },
                    "Failed to clean up one or more uploaded temp files",
                );
            }
        });
    });

    next();
};
