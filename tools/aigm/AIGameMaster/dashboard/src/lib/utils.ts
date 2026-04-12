import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Strip Arma localization keys and path components to a readable map name.
 *  Handles both "#AR-Editor_Mission_GM_Eden_Name" and "World_Edit/ChernarusS.ent" inputs. */
export function cleanMapName(raw: string): string {
  if (!raw) return "";
  let name = raw;
  // Strip Arma localization key prefix (e.g. "#AR-Editor_Mission_")
  if (name.startsWith("#")) name = name.replace(/^#[A-Za-z]*[-_]?/, "");
  // Strip known Editor/Mission prefixes
  name = name.replace(/^Editor_Mission_/i, "");
  name = name.replace(/^Mission_/i, "");
  // If it is a path, take the last component
  const parts = name.split(/[/\\]/);
  name = parts[parts.length - 1] || name;
  // Normalise separators to spaces
  name = name.replace(/[_-]/g, " ");
  // Drop trailing " Name" suffix added by some Arma locale keys
  name = name.replace(/\s*Name$/i, "");
  return name.trim();
}

/** Format a duration in seconds to a human-readable string: "42s", "5m 12s", "2h 7m". */
export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
