export async function parseBackupFile(file: File): Promise<unknown> {
  if (!file.name.toLowerCase().endsWith(".json")) {
    throw new Error("Please choose a .json PromptDeck backup file.");
  }

  const raw = await file.text();
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("This file is not valid JSON.");
  }
}
