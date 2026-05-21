type FileHeaderProps = {
  fileName: string | null;
  fullPath: string | null;
  isModified: boolean;
};

const headerShell =
  "flex items-center gap-2 min-w-0 rounded-2xl bg-[color:var(--islands-surface)] ring-1 ring-[color:var(--islands-ring)] shadow-sm backdrop-blur px-3 py-2 text-sm font-medium text-[color:var(--islands-text)]";

export default function FileHeader({
  fileName,
  fullPath,
  isModified,
}: FileHeaderProps) {
  if (fileName === null) {
    return (
      <header
        className={headerShell}
        role="status"
        aria-live="polite"
      >
        {isModified && <span aria-label="modified">* </span>}
        <span title="No file open">Untitled</span>
      </header>
    );
  }
  return (
    <header className={headerShell} role="status" aria-live="polite">
      {isModified && <span aria-label="modified">* </span>}
      <span className="truncate" title={fullPath ?? fileName}>
        {fileName}
      </span>
    </header>
  );
}
