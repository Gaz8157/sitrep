"use client";

import { useState, useEffect, useCallback } from "react";

interface PanelState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

const STORAGE_KEY = "dashboard-panel-state";
const DEFAULT: PanelState = { leftCollapsed: false, rightCollapsed: false };

function persist(next: PanelState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage quota exceeded — in-memory state still updated
  }
}

export function usePanelState() {
  const [state, setState] = useState<PanelState>(DEFAULT);

  // Load from localStorage on mount (client-only — avoids SSR mismatch)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.leftCollapsed === "boolean" &&
          typeof parsed.rightCollapsed === "boolean"
        ) {
          setState(parsed as PanelState);
        }
      }
    } catch {
      // Ignore parse errors — use default
    }
  }, []);

  const toggleLeft = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, leftCollapsed: !prev.leftCollapsed };
      persist(next);
      return next;
    });
  }, []);

  const toggleRight = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, rightCollapsed: !prev.rightCollapsed };
      persist(next);
      return next;
    });
  }, []);

  return {
    leftCollapsed: state.leftCollapsed,
    rightCollapsed: state.rightCollapsed,
    toggleLeft,
    toggleRight,
  };
}
