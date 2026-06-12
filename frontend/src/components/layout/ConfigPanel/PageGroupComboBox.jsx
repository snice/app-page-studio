import { ComboBox } from '@heroui/react/combo-box';
import { Input } from '@heroui/react/input';
import { ListBox } from '@heroui/react/list-box';
import { Icon } from '../../common/Icon';
import { UNGROUPED_KEY } from './helpers';

export function PageGroupComboBox({ groups, value, disabled, readOnly = false, onChange }) {
  const items = [
    { id: UNGROUPED_KEY, name: '未分组' },
    ...groups.map((group) => ({
      id: String(group.id),
      name: group.name || '未命名分组',
      description: group.description || '',
    })),
  ];
  const isDisabled = disabled || readOnly;
  const selectedKey = disabled ? null : value ? String(value) : UNGROUPED_KEY;

  return (
    <ComboBox
      aria-label="所属页面分组"
      className="page-group-combobox"
      fullWidth
      isDisabled={isDisabled}
      menuTrigger="focus"
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        if (isDisabled || key == null) return;
        const nextKey = String(key);
        onChange(nextKey === UNGROUPED_KEY ? null : nextKey);
      }}
    >
      <ComboBox.InputGroup className="page-group-combobox-input-group">
        <Input
          className="page-group-combobox-input"
          placeholder={disabled ? '请先选择页面文件' : '搜索或选择页面分组'}
        />
        <ComboBox.Trigger className="page-group-combobox-trigger" aria-label="打开页面分组列表">
          <Icon name="chevronDown" size="sm" />
        </ComboBox.Trigger>
      </ComboBox.InputGroup>
      <ComboBox.Popover className="page-group-combobox-popover" placement="bottom start">
        <ListBox className="page-group-combobox-list" items={items}>
          {(item) => (
            <ListBox.Item
              key={item.id}
              id={item.id}
              textValue={item.name}
              className="page-group-combobox-item"
            >
              <span className="page-group-combobox-item-content">
                <span className="page-group-combobox-item-title">{item.name}</span>
                {item.description && (
                  <span className="page-group-combobox-item-desc">{item.description}</span>
                )}
              </span>
              <ListBox.ItemIndicator className="page-group-combobox-item-indicator" />
            </ListBox.Item>
          )}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}
