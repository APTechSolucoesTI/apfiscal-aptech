import { Controller, Get } from "@nestjs/common";
import { Public } from "@/common/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  health() {
    return { status: "ok", service: "apfiscal-api", timestamp: new Date().toISOString() };
  }

  @Public()
  @Get("ready")
  ready() {
    return { status: "ready", checks: { process: "ok" }, timestamp: new Date().toISOString() };
  }
}
