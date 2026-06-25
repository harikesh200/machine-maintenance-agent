import path from "node:path";

export const workspaceRoot = process.cwd();
export const dataDir = path.join(workspaceRoot, "data");
export const uploadsDir = path.join(dataDir, "uploads");
export const artifactsDir = path.join(dataDir, "artifacts");
export const jobsDir = path.join(dataDir, "jobs");
