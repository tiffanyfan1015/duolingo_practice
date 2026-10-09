export function downloadBackup(text) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cijian-progress-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readBackup(file) {
  if (file.size > 5e6) throw new Error("Backup exceeds 5 MB");
  return file.text();
}
