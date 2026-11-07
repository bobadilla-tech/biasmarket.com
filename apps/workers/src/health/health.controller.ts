import { Controller, Get } from "@nestjs/common";

// Liveness only — this app has no database. The API's /api/health endpoint
// also checks shared Redis readiness; worker connection failures are logged by
// the observed processors without turning this process probe into readiness.
@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { status: "ok" };
  }
}
