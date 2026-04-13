const ASAAS_API_KEY = process.env.ASAAS_API_KEY!;
const ASAAS_ENV = process.env.ASAAS_ENV || "sandbox";

const BASE_URL =
  ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

interface AsaasRequestOptions {
  method?: string;
  path: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function asaasFetch<T = any>({
  method = "GET",
  path,
  body,
  params,
}: AsaasRequestOptions): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value)
    );
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      access_token: ASAAS_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Asaas error: ${response.status} ${JSON.stringify(error)}`
    );
  }

  return response.json();
}
