// Prisma reports problems with a short code, e.g. P2002 = unique value already
// exists, P2003 = foreign key points at nothing, P2025 = record not found.
export function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
