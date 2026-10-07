export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}

/**
 * Thin typed wrapper over fetch. Requests go to this site's own /api path, which Next forwards to the
 * backend, so the login cookie is first party and never visible to scripts. Errors arrive
 * as RFC 9457 problem details from the backend.
 */
export async function api<T>(path: string, { method = "GET", body }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  // A FormData body (file uploads) sets its own content type with the multipart boundary.
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Is the backend running?");
  }

  if (!response.ok) {
    let message = response.statusText || "Request failed";
    let fields: Record<string, string> | undefined;
    try {
      const problem = await response.json();
      message = problem.detail ?? message;
      fields = problem.fields;
    } catch {
      // Not JSON, keep the status text.
    }
    throw new ApiError(response.status, message, fields);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
