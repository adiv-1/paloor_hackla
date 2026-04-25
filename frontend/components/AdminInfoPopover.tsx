"use client";

import React, { useState } from "react";
import { Info, X } from "lucide-react";

interface AdminInfoPopoverProps {
  title: string;
  description: string;
  tips?: string[];
  className?: string;
}

export function AdminInfoPopover({ title, description, tips, className = "" }: AdminInfoPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="p-0.5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        aria-label={`Info: ${title}`}
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full mt-2 right-0 w-72 bg-popover border border-border rounded-xl shadow-lg p-4 animate-in fade-in-0 zoom-in-95">
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-medium text-sm">{title}</h4>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
            {tips && tips.length > 0 && (
              <ul className="mt-2 space-y-1">
                {tips.map((tip, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-primary mt-0.5">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </span>
  );
}
