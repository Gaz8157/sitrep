"use client";

import type { ReactNode } from "react";

export interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function MobileDrawer({ open, onClose, children }: MobileDrawerProps) {
  return (
    <>
      {/* Backdrop — dims map behind open drawer */}
      <div
        className={`fixed inset-0 z-30 bg-black/60 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer — slides up from bottom */}
      <div
        inert={!open}
        className={`fixed bottom-0 left-0 right-0 z-40 max-h-[85vh] flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Drag handle visual affordance */}
        <div className="flex justify-center pt-2 pb-1 bg-card/95 backdrop-blur-xl border-t border-white/[0.06] rounded-t-2xl shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-card/95 backdrop-blur-xl">
          {children}
        </div>
      </div>
    </>
  );
}
