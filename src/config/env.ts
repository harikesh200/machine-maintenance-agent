import "dotenv/config";
import * as z from "zod";

const envSchema = z.object({
    NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z
        .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
        .default("info"),
    CORS_ORIGIN: z
        .string()
        .default("http://localhost:5173,http://localhost:3000"),
    OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
    OPENAI_MODEL: z.string().min(1).default("gpt-4o"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error(
        "Invalid environment configuration:",
        z.flattenError(parsed.error).fieldErrors,
    );
    process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
