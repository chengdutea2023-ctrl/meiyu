export function appendQueryParams(
  baseUrl: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

