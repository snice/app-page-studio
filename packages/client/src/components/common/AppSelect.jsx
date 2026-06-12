import { useMemo } from 'react';
import { Select } from '@heroui/react/select';
import { ListBox } from '@heroui/react/list-box';

const EMPTY_VALUE_PREFIX = '__app_select_empty__';

function normalizeOptions(options) {
  return options.map((option, index) => {
    const source = typeof option === 'string'
      ? { value: option, label: option }
      : option;
    const value = source.value == null ? '' : String(source.value);
    const keySource = source.key == null ? value : source.key;
    const key = value === '' && keySource === ''
      ? `${EMPTY_VALUE_PREFIX}_${index}`
      : String(keySource);

    return {
      key,
      value,
      label: source.label ?? value,
      disabled: !!source.disabled,
    };
  });
}

export function AppSelect({
  value,
  options,
  placeholder = '请选择',
  ariaLabel = '选择',
  disabled = false,
  compact = false,
  className = '',
  onValueChange,
}) {
  const items = useMemo(() => normalizeOptions(options), [options]);
  const stringValue = value == null ? '' : String(value);
  const selectedItem = items.find((item) => item.value === stringValue) ?? null;
  const selectedKey = selectedItem?.key ?? null;

  return (
    <Select
      aria-label={ariaLabel}
      className={`app-select ${compact ? 'app-select-compact' : ''} ${className}`.trim()}
      fullWidth
      isDisabled={disabled}
      placeholder={placeholder}
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        if (disabled || key == null) return;
        const selectedItem = items.find((item) => item.key === String(key));
        if (!selectedItem || selectedItem.disabled) return;
        onValueChange?.(selectedItem.value);
      }}
    >
      <Select.Trigger className="app-select-trigger">
        <Select.Value className="app-select-value">
          {selectedItem?.label ?? placeholder}
        </Select.Value>
        <Select.Indicator className="app-select-indicator" />
      </Select.Trigger>
      <Select.Popover
        className={`app-select-popover ${compact ? 'app-select-popover-compact' : ''}`.trim()}
        placement="bottom start"
      >
        <ListBox className="app-select-list" items={items}>
          {(item) => (
            <ListBox.Item
              key={item.key}
              id={item.key}
              textValue={String(item.label)}
              isDisabled={item.disabled}
              className="app-select-item"
            >
              <span className="app-select-item-label">{item.label}</span>
              <ListBox.ItemIndicator className="app-select-item-indicator" />
            </ListBox.Item>
          )}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
