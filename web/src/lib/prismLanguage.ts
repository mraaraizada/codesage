/** Maps a repo-relative file path to a Prism grammar name for real syntax highlighting (see
 * components/ui/code-block.tsx) — used for the short evidence snippets in the verdict panel. */
export function prismLanguageForPath(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".ts":
      return "typescript";
    case ".tsx":
      return "tsx";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".jsx":
      return "jsx";
    case ".py":
      return "python";
    case ".json":
      return "json";
    case ".css":
      return "css";
    case ".md":
      return "markdown";
    default:
      return "tsx";
  }
}
