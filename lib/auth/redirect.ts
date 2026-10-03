export function safeCallbackUrl(value: string | null, locale: string) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  ) {
    return `/${locale}/dashboard`;
  }
  return value;
}
