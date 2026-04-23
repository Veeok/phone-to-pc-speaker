import { useEffect, useMemo, useState } from 'react';
import { SearchIcon, SparklesIcon } from './icons';
import { EmptyStateBlock, ModalShell, TextField, type UiTone } from './ui';
import { cn } from './utils';

export interface CommandPaletteItem {
  id: string;
  group: string;
  label: string;
  description: string;
  meta?: string;
  keywords?: string[];
  disabled?: boolean;
  tone?: UiTone;
  onSelect: () => void;
}

function matchesQuery(item: CommandPaletteItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return true;
  }

  const haystack = [item.label, item.description, item.meta ?? '', ...(item.keywords ?? [])].join(' ').toLowerCase();
  return haystack.includes(normalizedQuery);
}

export function CommandPalette({
  open,
  items,
  onClose
}: {
  open: boolean;
  items: CommandPaletteItem[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredItems = useMemo(() => items.filter((item) => matchesQuery(item, query)), [items, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery('');
    setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    if (activeIndex > filteredItems.length - 1) {
      setActiveIndex(Math.max(filteredItems.length - 1, 0));
    }
  }, [activeIndex, filteredItems.length]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((current) => (filteredItems.length === 0 ? 0 : Math.min(current + 1, filteredItems.length - 1)));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) => (filteredItems.length === 0 ? 0 : Math.max(current - 1, 0)));
        return;
      }

      if (event.key === 'Enter') {
        const target = filteredItems[activeIndex];
        if (target === undefined || target.disabled) {
          return;
        }

        event.preventDefault();
        target.onSelect();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [activeIndex, filteredItems, onClose, open]);

  if (!open) {
    return null;
  }

  const groupedItems = filteredItems.reduce<Map<string, CommandPaletteItem[]>>((groups, item) => {
    const existing = groups.get(item.group) ?? [];
    existing.push(item);
    groups.set(item.group, existing);
    return groups;
  }, new Map());

  let runningIndex = -1;

  return (
    <ModalShell onClose={onClose} size="lg" subtitle="Search actions, devices, settings, and diagnostics shortcuts." title="Command Palette">
      <div className="command-palette">
        <TextField
          autoFocus
          className="field--compact"
          hideLabel
          label="Command search"
          leading={<SearchIcon />}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search devices and commands"
          value={query}
        />

        {filteredItems.length === 0 ? (
          <EmptyStateBlock
            description="Try a device name, command label, or a workflow keyword like open or diagnostics."
            icon={<SparklesIcon />}
            title="No matching commands"
          />
        ) : (
          <div className="command-palette__groups">
            {Array.from(groupedItems.entries()).map(([groupName, groupItems]) => (
              <div className="command-group" key={groupName}>
                <p className="command-group__title">{groupName}</p>
                <div className="command-group__items">
                  {groupItems.map((item) => {
                    runningIndex += 1;
                    const itemIndex = runningIndex;
                    const isActive = itemIndex === activeIndex;

                    return (
                      <button
                        className={cn(
                          'command-item',
                          isActive && 'command-item--active',
                          item.disabled && 'command-item--disabled',
                          item.tone && `command-item--${item.tone}`
                        )}
                        disabled={item.disabled}
                        key={item.id}
                        onClick={() => {
                          item.onSelect();
                          onClose();
                        }}
                        onMouseEnter={() => setActiveIndex(itemIndex)}
                        type="button"
                      >
                        <div className="command-item__copy">
                          <strong>{item.label}</strong>
                          <p>{item.description}</p>
                        </div>
                        {item.meta ? <span className="command-item__meta">{item.meta}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
