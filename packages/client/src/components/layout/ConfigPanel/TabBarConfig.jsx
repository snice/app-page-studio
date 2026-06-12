import { useAppStore } from '../../../lib/state';
import { TabIconUploader } from './TabIconUploader';

export function TabBarConfig({ readOnly = false }) {
  const currentFile = useAppStore((s) => s.currentFile);
  const updateCurrentFile = useAppStore((s) => s.updateCurrentFile);
  const isTabbar = currentFile?.isTabbarPage || false;

  const handleToggle = (checked) => {
    if (readOnly) return;
    updateCurrentFile({
      isTabbarPage: checked,
      tabIndex: checked ? (currentFile?.tabIndex || null) : null,
      tabName: checked ? (currentFile?.tabName || null) : null,
      tabIconDefault: checked ? (currentFile?.tabIconDefault || null) : null,
      tabIconSelected: checked ? (currentFile?.tabIconSelected || null) : null,
    });
  };

  const handleFieldChange = (field, value) => {
    if (readOnly) return;
    updateCurrentFile({ [field]: value });
  };

  return (
    <div className="panel-section">
      <div className="panel-section-title">Tabbar 配置</div>
      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={isTabbar}
            onChange={(e) => handleToggle(e.target.checked)}
            disabled={readOnly}
          />
          <span>这是 Tabbar 页面</span>
        </label>
      </div>
      {isTabbar && (
        <>
          <div className="form-group">
            <label className="form-label">Tab 序号（从1开始）</label>
            <input type="number" className="form-input" min="1" max="10" placeholder="如：1"
              value={currentFile?.tabIndex || ''}
              onChange={(e) => handleFieldChange('tabIndex', e.target.value ? parseInt(e.target.value) : null)}
              readOnly={readOnly} />
          </div>
          <div className="form-group">
            <label className="form-label">Tab 名称</label>
            <input type="text" className="form-input" placeholder="如：首页"
              value={currentFile?.tabName || ''}
              onChange={(e) => handleFieldChange('tabName', e.target.value || null)}
              readOnly={readOnly} />
          </div>
          <TabIconUploader
            label="默认图标"
            value={currentFile?.tabIconDefault}
            placeholder="如：assets/tab_home.png"
            onChange={(v) => handleFieldChange('tabIconDefault', v)}
            readOnly={readOnly}
          />
          <TabIconUploader
            label="选中图标"
            value={currentFile?.tabIconSelected}
            placeholder="如：assets/tab_home_selected.png"
            onChange={(v) => handleFieldChange('tabIconSelected', v)}
            readOnly={readOnly}
          />
        </>
      )}
    </div>
  );
}
