import { returnToFromState } from "../routing/return-location.ts";

export function parsePlaceId(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/u.test(value)) {
    return null;
  }

  const placeId = Number(value);

  return Number.isSafeInteger(placeId) ? placeId : null;
}

export function placeListReturnTo(state: unknown): string {
  const returnTo = returnToFromState(state, "/places");

  return returnTo === "/places" ||
    returnTo.startsWith("/places?") ||
    returnTo.startsWith("/places#")
    ? returnTo
    : "/places";
}
