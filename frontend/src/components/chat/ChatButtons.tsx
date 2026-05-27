'use client';

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
}: Props) {
  if (!buttons.length || disabled) {
    return null;
  }

  const isTime = timeSlots || buttons.every((b) => /^\d{1,2}:\d{2}$/.test(b.label.trim()));

  return (
    <div className={`mt-2 ${layoutClass(buttons.length, isTime)}`}>
      {buttons.map((b) => (
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
  );
}
