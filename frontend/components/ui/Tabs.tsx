"use client";

import { type KeyboardEvent, type ReactNode, useRef } from "react";

/** WAI-ARIA tabs with automatic activation: arrow keys, Home and End move focus and select. */

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}

export function tabId(idBase: string, id: string): string {
  return `${idBase}-tab-${id}`;
}

export function panelId(idBase: string, id: string): string {
  return `${idBase}-panel-${id}`;
}

export interface TabsProps<T extends string> {
  /** Shared prefix for the tab and panel ids (use the same one on each TabPanel). */
  idBase: string;
  /** Accessible name of the tablist. */
  label: string;
  items: readonly TabItem<T>[];
  /** The selected tab, or null when none is (e.g. "show every day"). */
  selected: T | null;
  onSelect: (id: T) => void;
  className?: string;
  tabClassName?: (selected: boolean) => string;
}

export function Tabs<T extends string>({
  idBase,
  label,
  items,
  selected,
  onSelect,
  className,
  tabClassName,
}: TabsProps<T>) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = items.findIndex((item) => item.id === selected);
  // Roving tabindex: the selected tab (or the first one) is the tablist's single tab stop.
  const focusable = selectedIndex === -1 ? 0 : selectedIndex;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = tabs.current.findIndex((tab) => tab === event.target);
    if (current === -1) return;
    const last = items.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (current + 1) % items.length
        : event.key === "ArrowLeft"
          ? (current - 1 + items.length) % items.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    tabs.current[next]?.focus();
    onSelect(items[next].id);
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={className}>
      {items.map((item, index) => {
        const isSelected = item.id === selected;
        return (
          <button
            key={item.id}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={tabId(idBase, item.id)}
            aria-selected={isSelected}
            aria-controls={panelId(idBase, item.id)}
            tabIndex={index === focusable ? 0 : -1}
            onClick={() => onSelect(item.id)}
            className={tabClassName?.(isSelected)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  idBase: string;
  id: string;
  hidden?: boolean;
  className?: string;
  children: ReactNode;
}

export function TabPanel({ idBase, id, hidden = false, className, children }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={panelId(idBase, id)}
      aria-labelledby={tabId(idBase, id)}
      tabIndex={0}
      hidden={hidden}
      className={className}
    >
      {children}
    </div>
  );
}
