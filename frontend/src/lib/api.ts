export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:8001"
).replace(/\/+$/, "");

export const dependencyNames = ["postgres", "redis", "storage"] as const;

export type DependencyName = (typeof dependencyNames)[number];
export type HealthStatus = "ok" | "unavailable";

export interface ReadinessResponse {
  status: HealthStatus;
  checks: Record<DependencyName, HealthStatus>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHealthStatus(value: unknown): value is HealthStatus {
  return value === "ok" || value === "unavailable";
}

function isReadinessResponse(value: unknown): value is ReadinessResponse {
  if (!isRecord(value) || !isHealthStatus(value.status)) {
    return false;
  }

  const checks = value.checks;

  if (!isRecord(checks)) {
    return false;
  }

  return dependencyNames.every((name) => isHealthStatus(checks[name]));
}

export async function getReadiness(
  signal: AbortSignal,
): Promise<ReadinessResponse> {
  const response = await fetch(`${API_BASE_URL}/health/ready`, {
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  const body: unknown = await response.json();

  if (!isReadinessResponse(body)) {
    throw new Error("Backend returned an invalid readiness response");
  }

  return body;
}
