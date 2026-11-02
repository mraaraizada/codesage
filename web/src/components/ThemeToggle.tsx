import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

function getInitialDark(): boolean {
  // Lets a link force a theme (e.g. for a demo or a visual check) without needing a click first.
  const forced = new URLSearchParams(window.location.search).get("theme");
  if (forced === "dark") return true;
  if (forced === "light") return false;
  try {
    const stored = localStorage.getItem("codesage-theme");
    if (stored === "dark") return true;
    if (stored === "light") return false;
  } catch {
    // ignore
  }
  // The investigation console is modeled on a dark-first "agent ops" dashboard, so it defaults to
  // dark rather than following the OS preference, until the person picks a theme explicitly.
  return true;
}

/** OpenBot's theme tokens are class-driven (`.dark` on an ancestor), not media-query-driven —
 * this toggle is CodeSage's own minimal switch for that same mechanism. */
export function ThemeToggle() {
  const [dark, setDark] = useState(getInitialDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("codesage-theme", dark ? "dark" : "light");
    } catch {
      // ignore
    }
  }, [dark]);

  return (
    <Button type="button" variant="ghost" size="icon" className="ml-auto" onClick={() => setDark((d) => !d)} aria-label="Toggle dark mode">
      {dark ? <IconSun /> : <IconMoon />}
    </Button>
  );
}
