const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

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
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
}

/** Thin typed wrapper over fetch. Errors arrive as RFC 9457 problem details from the backend. */
export async function api<T>(path: string, { method = "GET", body, token }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
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
