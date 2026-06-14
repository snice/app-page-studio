import { useState } from 'react';
import { Icon } from '../common/Icon';
import { ModalOverlay } from './ModalOverlay';
import { api } from '../../lib/api';
import { useAppStore } from '../../lib/state';

function fileTitle(file) {
  if (!file) return '未选择页面';
  return file.stateName || file.name || file.path?.split('/').pop() || '未命名页面';
}

function buildHistory(messages) {
  return messages
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .map((item) => ({ role: item.role, content: item.content }));
}

export function DesignHtmlAgentModal({ isOpen, onClose, device, onGenerated }) {
  const currentFile = useAppStore((s) => s.currentFile);
  const isCurrentEditor = useAppStore((s) => s.session.isCurrentEditor);
  const showToast = useAppStore((s) => s.showToast);
  const updateCurrentFile = useAppStore((s) => s.updateCurrentFile);
  const project = useAppStore((s) => s.getCurrentProject());

  const isDesignFile = currentFile?.sourceType === 'image' || currentFile?.sourceType === 'psd';
  const hasGeneratedHtml = !!currentFile?.generatedHtmlPath;
  const title = fileTitle(currentFile);

  const [messages, setMessages] = useState(() => [
    {
      role: 'assistant',
      content: currentFile?.generatedHtmlPath
        ? `当前已有 HTML IR：${currentFile.generatedHtmlPath}。可以直接输入调整意见。`
        : '当前还没有 HTML IR。先生成第一版，然后可以继续对话修正。'
    }
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ message: '', chars: 0, stages: [] });

  if (!isOpen) {
    return null;
  }

  const applyAgentResult = (res, assistantText) => {
    updateCurrentFile({
      generatedHtmlPath: res.htmlPath,
      htmlIrStatus: res.status || 'generated',
      htmlIrRounds: res.rounds || 1,
      htmlIrUpdatedAt: res.updatedAt,
      htmlIrSourcePath: res.sourcePath,
    });
    onGenerated?.(res);
    setMessages((items) => [
      ...items,
      {
        role: 'assistant',
        content: assistantText || `已更新 HTML IR：${res.htmlPath}`
      }
    ]);
  };

  const resetProgress = () => {
    setProgress({ message: '准备开始', chars: 0, stages: [] });
  };

  const handleStreamStage = (payload) => {
    const message = payload?.message || payload?.stage || '处理中';
    setProgress((prev) => ({
      ...prev,
      message,
      stages: [
        ...prev.stages,
        {
          stage: payload?.stage || message,
          message,
          at: payload?.at || new Date().toISOString(),
        }
      ].slice(-8),
    }));
  };

  const handleStreamDelta = (payload) => {
    const deltaLength = String(payload?.text || '').length;
    setProgress((prev) => ({
      ...prev,
      chars: Number.isFinite(Number(payload?.chars)) ? Number(payload.chars) : prev.chars + deltaLength,
    }));
  };

  const streamHandlers = {
    onStage: handleStreamStage,
    onDelta: handleStreamDelta,
  };

  const generate = async () => {
    if (!currentFile || !isDesignFile) {
      showToast('请选择 PNG/PSD 设计稿');
      return;
    }
    if (!isCurrentEditor) {
      showToast('当前为只读，不能生成 HTML IR');
      return;
    }
    setBusy(true);
    resetProgress();
    setMessages((items) => [...items, { role: 'user', content: hasGeneratedHtml ? '重新根据设计图生成 HTML IR' : '生成第一版 HTML IR' }]);
    try {
      const res = await api.generateHtmlIrStream({
        file: currentFile,
        device,
        designSystem: project?.designSystem || null,
      }, streamHandlers);
      if (res.error) throw new Error(res.error);
      applyAgentResult(res, `已生成 HTML IR：${res.htmlPath}。预览区已切换到 HTML IR。`);
      showToast('HTML IR 已生成');
    } catch (e) {
      const message = e.message || '生成失败';
      setMessages((items) => [...items, { role: 'assistant', content: message }]);
      showToast(message);
    } finally {
      setBusy(false);
    }
  };

  const refine = async () => {
    const instruction = input.trim();
    if (!instruction) return;
    if (!currentFile || !isDesignFile) {
      showToast('请选择 PNG/PSD 设计稿');
      return;
    }
    if (!isCurrentEditor) {
      showToast('当前为只读，不能调整 HTML IR');
      return;
    }
    if (!hasGeneratedHtml) {
      showToast('请先生成 HTML IR');
      return;
    }

    const nextMessages = [...messages, { role: 'user', content: instruction }];
    setMessages(nextMessages);
    setInput('');
    setBusy(true);
    resetProgress();
    try {
      const res = await api.refineHtmlIrStream({
        file: currentFile,
        device,
        designSystem: project?.designSystem || null,
        instruction,
        history: buildHistory(messages),
      }, streamHandlers);
      if (res.error) throw new Error(res.error);
      applyAgentResult(res, `已按反馈更新 HTML IR：${res.htmlPath}`);
      showToast('HTML IR 已更新');
    } catch (e) {
      const message = e.message || '调整失败';
      setMessages((items) => [...items, { role: 'assistant', content: message }]);
      showToast(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="modal ai-html-agent-modal">
        <div className="modal-header">
          <span className="modal-title">
            <Icon name="sparkles" size="sm" />
            AI HTML IR
          </span>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body ai-html-agent-body">
          <div className="ai-html-agent-meta">
            <div>
              <span className="ai-html-agent-label">页面</span>
              <strong>{title}</strong>
            </div>
            <div>
              <span className="ai-html-agent-label">预览设备</span>
              <strong>{device?.width || 375}x{device?.height || 812}</strong>
            </div>
            <div>
              <span className="ai-html-agent-label">HTML IR</span>
              <strong>{currentFile?.generatedHtmlPath || '未生成'}</strong>
            </div>
          </div>

          {!isDesignFile && (
            <div className="ai-html-agent-warning">
              <Icon name="info" size="sm" />
              <span>请选择 PNG 或 PSD 设计稿后再使用 AI HTML IR。</span>
            </div>
          )}

          <div className="ai-html-agent-chat">
            {messages.map((message, index) => (
              <div className={`ai-html-agent-message ${message.role}`} key={`${message.role}-${index}`}>
                {message.content}
              </div>
            ))}
            {busy && (
              <div className="ai-html-agent-progress">
                <div className="ai-html-agent-progress-head">
                  <Icon name="clock" size="sm" />
                  <span>{progress.message || '正在调用 AI Agent...'}</span>
                </div>
                {progress.chars > 0 && (
                  <div className="ai-html-agent-progress-count">
                    已接收 HTML {progress.chars} 字符
                  </div>
                )}
                {progress.stages.length > 0 && (
                  <div className="ai-html-agent-stage-list">
                    {progress.stages.map((stage, index) => (
                      <div className="ai-html-agent-stage" key={`${stage.stage}-${stage.at}-${index}`}>
                        <Icon name="check" size="sm" />
                        <span>{stage.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ai-html-agent-input-row">
            <textarea
              className="form-textarea ai-html-agent-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例如：顶部标题再往下 8px，按钮颜色更接近设计图，列表卡片阴影减弱"
              disabled={busy || !isDesignFile || !hasGeneratedHtml || !isCurrentEditor}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') refine();
              }}
            />
            <button
              className="btn btn-primary ai-html-agent-send"
              onClick={refine}
              disabled={busy || !input.trim() || !isDesignFile || !hasGeneratedHtml || !isCurrentEditor}
            >
              <Icon name="arrowUp" size="sm" />
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={generate}
            disabled={busy || !isDesignFile || !isCurrentEditor}
            title={!isCurrentEditor ? '当前为只读' : undefined}
          >
            <Icon name="sparkles" />
            {hasGeneratedHtml ? '重新生成' : '生成 HTML IR'}
          </button>
          <button className="btn btn-primary" onClick={onClose}>完成</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
