import "dotenv/config";

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { initErrorTracking } from "./common/error-tracking.js";
import { validateEnv } from "./config/env.validation.js";
import metadata from "./metadata.js";

async function bootstrap() {
  // Refuse to boot before the server starts listening if a required env var
  // is missing, rather than failing on the first request that needs it.
  validateEnv();
  // Env-gated: no-op unless SENTRY_DSN is set, so local dev isn't forced to
  // configure it (unhandled errors still reach stdout either way).
  initErrorTracking();

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // helmet with CSP enabled (helmet's default directives), except for the
  // Swagger UI surface at /api/docs — default CSP blocks Swagger's inline
  // scripts/styles, and Swagger is a dev/recon surface that's off by default
  // in production (see swaggerEnabled below). Every other API response keeps a
  // real Content-Security-Policy.
  const helmetMiddleware = helmet();
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/docs")) return next();
    helmetMiddleware(req, res, next);
  });

  app.setGlobalPrefix("api");

  app.enableCors({
    origin: process.env.WEB_URL ?? "http://localhost:3001",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // loadPluginMetadata must run before createDocument — it populates the
  // metadata registry createDocument reads from. Without it, response types
  // inferred by the standalone PluginMetadataGenerator (see
  // scripts/generate-swagger-metadata.ts) are silently dropped from the spec.
  await SwaggerModule.loadPluginMetadata(metadata);
  const swaggerDocument = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Bias Market API")
      .setDescription("Bias Market — niche-first store builder API")
      .setVersion("1.0")
      .build(),
  );

  // Swagger UI exposes route/model shape (recon surface), so keep it enabled
  // by default outside production and opt-in only in production.
  const swaggerEnabled = process.env.SWAGGER_ENABLED
    ? process.env.SWAGGER_ENABLED === "true"
    : process.env.NODE_ENV !== "production";
  if (swaggerEnabled) {
    SwaggerModule.setup("api/docs", app, swaggerDocument);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
