"use client";

import { useCommandPalette } from "@/hooks/useCommandPalette";
import { CommandPalette } from "@/components/agent/CommandPalette";

/**
 * Client-side wrapper that wires up the Cmd+K shortcut
 * and renders the CommandPalette overlay.
 */
export function CommandPaletteProvider() {
  const { isOpen, setIsOpen } = useCommandPalette();
  return <CommandPalette isOpen={isOpen} setIsOpen={setIsOpen} />;
}
