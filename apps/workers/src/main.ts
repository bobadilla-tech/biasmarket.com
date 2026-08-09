import "dotenv/config";

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { validateEnv } from "./config/env.validation.js";

async function bootstrap() {
  // Refuse to boot before the process starts listening if a required env
  // var is missing, rather than stalling silently on the first job.
  validateEnv();

  const app = await NestFactory.create(AppModule);

  // Without this, a `docker compose down`/redeploy SIGTERMs the container
  // mid-job. Enabling shutdown hooks makes Nest call onApplicationShutdown
  // on every provider, including @nestjs/bullmq's internal BullExplorer,
  // which closes each registered Worker — BullMQ's close() waits for the
  // in-flight job to finish (up to a configurable timeout) instead of
  // dropping it.
  app.enableShutdownHooks();

  // Real (tiny) HTTP server, not NestFactory.createApplicationContext —
  // matches the repo's Docker healthcheck convention ("hit an HTTP
  // endpoint", see infra/docker/api-healthcheck.ts) so `docker compose ps`/
  // `depends_on: condition: service_healthy` works the same way for every
  // service. Never reached from the internet or from apps/web — only other
  // containers on the same Docker network can reach this port.
  await app.listen(process.env.PORT ?? 3002);
}
bootstrap();
