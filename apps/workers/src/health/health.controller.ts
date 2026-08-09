import { Controller, Get } from "@nestjs/common";

// Liveness only — this app has no database. Queue-depth / Redis-connection
// reporting can be added here later without inventing a second healthcheck
// mechanism.
@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { status: "ok" };
  }
}
