export const SUPPORTED_FORMATS = ["mBank", "Pekao", "ING"] as const;

export function isCsvFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".csv");
}
