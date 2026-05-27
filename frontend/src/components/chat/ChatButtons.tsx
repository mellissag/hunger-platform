'use client';

import { useState } from 'react';

export interface ChatButtonItem {
  label: string;
  value: string;
}

interface Props {
  buttons: ChatButtonItem[];
  disabled?: boolean;
  onSelect: (value: string, label: string) => void;
  /** Time-slot buttons use horizontal rows of 4 */
  timeSlots?: boolean;
  isDark?: boolean;
  hasMoreSlots?: boolean;
  /** Full slot list for client-side pagination (label + value) */
  slotButtons?: ChatButtonItem[];
  allSlots?: string[];
  showMoreTimesLabel?: string;
}

function layoutClass(count: number, timeSlots: boolean): string {
  if (timeSlots) {
    return 'grid grid-cols-4 gap-2 w-full';
  }
  if (count <= 2) {
    return 'flex flex-wrap gap-2';
  }
  if (count <= 4) {
    return 'grid grid-cols-2 gap-2 w-full';
  }
  return 'flex flex-col gap-2 w-full';
}

export function ChatButtons({
  buttons,
  disabled = false,
  onSelect,
  timeSlots = false,
  isDark = false,
  hasMoreSlots = false,
  slotButtons,
  allSlots,
  showMoreTimesLabel,
}: Props) {
  const [visibleCount, setVisibleCount] = useState(8);

  if (!buttons.length || disabled) {
    return null;
  }

  const isTime =
    timeSlots ||
    Boolean(slotButtons?.length) ||
    buttons.every((b) => /^\d{1,2}:\d{2}$/.test(b.label.trim()));

  let displayButtons = buttons;
  if (isTime && slotButtons && slotButtons.length > 0) {
    displayButtons = slotButtons.slice(0, visibleCount);
  } else if (isTime && allSlots && allSlots.length > 0) {
    const valueByLabel = new Map(buttons.map((b) => [b.label, b.value]));
    displayButtons = allSlots.slice(0, visibleCount).map((label) => ({
      label,
      value: valueByLabel.get(label) ?? label,
    }));
  }

  const totalSlots = slotButtons?.length ?? allSlots?.length ?? buttons.length;
  const showMore =
    isTime &&
    hasMoreSlots &&
    showMoreTimesLabel &&
    visibleCount < totalSlots;

  return (
    <div className="mt-2 w-full">
      <div className={layoutClass(displayButtons.length, isTime)}>
        {displayButtons.map((b) => (
          <button
            key={`${b.value}-${b.label}`}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(b.value, b.label)}
            className="rounded-lg border px-3.5 py-2 text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none"
            style={{
              borderColor: '#C9A84C',
              background: isDark ? 'transparent' : '#FAF7F2',
              color: 'inherit',
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.background = '#C9A84C';
                e.currentTarget.style.color = '#1C1408';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDark ? 'transparent' : '#FAF7F2';
              e.currentTarget.style.color = 'inherit';
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
      {showMore && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setVisibleCount((c) => c + 8)}
          className="mt-2 w-full rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
          style={{
            height: 44,
            background: '#C9A84C',
            color: '#1A1A1A',
          }}
        >
          {showMoreTimesLabel}
        </button>
      )}
    </div>
  );
}
