export const SUPPORTED_FORMATS = ["mBank", "Pekao"] as const;

export function isCsvFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".csv");
}
