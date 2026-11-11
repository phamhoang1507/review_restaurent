import { API_BASE_URL } from "./api";
import { ApiClient } from "./auth-client";

export const authClient = new ApiClient({
  baseUrl: API_BASE_URL,
});
