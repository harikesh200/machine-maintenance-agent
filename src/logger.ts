import pino from "pino";
import { config } from "./config/env";

export const logger = pino({
    level: config.LOG_LEVEL,
    redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "*.password",
        "*.senderPassword",
        "*.token",
        "*.apiKey",
    ],
    ...(config.NODE_ENV === "production"
        ? {}
        : {
              transport: {
                  target: "pino-pretty",
                  options: {
                      colorize: true,
                      ignore: "pid,hostname",
                      translateTime: "SYS:standard",
                  },
              },
          }),
});
