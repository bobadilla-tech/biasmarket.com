import "dotenv/config";

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ValidationPipe } from "@nestjs/common";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import metadata from "./metadata.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

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

  // Swagger UI exposes route/model shape (recon surface) on an app that has
  // no CSRF/helmet yet (docs/core/deploy.md) — default on outside production,
  // off in production unless explicitly opted in.
  const swaggerEnabled = process.env.SWAGGER_ENABLED
    ? process.env.SWAGGER_ENABLED === "true"
    : process.env.NODE_ENV !== "production";
  if (swaggerEnabled) {
    SwaggerModule.setup("api/docs", app, swaggerDocument);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
