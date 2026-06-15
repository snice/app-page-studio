import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../common/Icon';
import { api } from '../../lib/api';
import { useAppStore } from '../../lib/state';
import { Picker, ColorPickerModule } from '../../lib/picker';

function fileTitle(file) {
  if (!file) return '未选择页面';
  return file.stateName || file.name || file.path?.split('/').pop() || '未命名页面';
}

function buildHistory(messages) {
  return messages
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .map((item) => ({ role: item.role, content: item.content }));
}

function compactText(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function formatAgentError(error, fallback = '执行失败') {
  const message = String(error?.message || fallback).trim();
  if (!message) return 'AI 调用失败';
  return message.startsWith('AI 调用失败') ? message : `AI 调用失败：${message}`;
}

function formatDuration(ms) {
  const safeMs = Math.max(0, Math.round(Number(ms) || 0));
  if (safeMs < 1000) return `${safeMs} 毫秒`;

  const seconds = safeMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds >= 10 ? 1 : 2)} 秒`;
  }

  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds - minutes * 60;
  return `${minutes} 分 ${restSeconds.toFixed(restSeconds >= 10 ? 0 : 1)} 秒`;
}

const INTERNAL_PICKER_CLASSES = new Set([
  'picker-hover', 'picker-selected', 'color-picker-hover', 'element-highlight',
]);

function clearIframeSelection(iframe) {
  try {
    iframe?.contentDocument?.querySelectorAll('.picker-selected').forEach((el) => {
      el.classList.remove('picker-selected');
    });
  } catch { }
}

function markIframeSelection(iframe, elements) {
  clearIframeSelection(iframe);
  try {
    const doc = iframe?.contentDocument;
    if (!doc) return;
    elements.forEach((item) => {
      if (!item?.selector) return;
      try {
        doc.querySelector(item.selector)?.classList.add('picker-selected');
      } catch { }
    });
  } catch { }
}

function escapeCssIdent(value, doc) {
  const css = doc?.defaultView?.CSS || globalThis.CSS;
  if (css?.escape) return css.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function selectorMatchesElement(doc, selector, el) {
  try {
    const matches = Array.from(doc.querySelectorAll(selector));
    return matches.length === 1 && matches[0] === el;
  } catch {
    return false;
  }
}

function uniqueSelectorForElement(el, fallbackSelector) {
  const doc = el?.ownerDocument;
  if (!doc || !el?.tagName) return fallbackSelector;
  if (fallbackSelector && selectorMatchesElement(doc, fallbackSelector, el)) return fallbackSelector;

  const segments = [];
  let node = el;

  while (node && node.nodeType === 1 && node !== doc.documentElement) {
    const tag = node.tagName.toLowerCase();
    let segment = tag;

    if (node.id) {
      segment += `#${escapeCssIdent(node.id, doc)}`;
    } else if (typeof node.className === 'string') {
      const classes = node.className
        .split(/\s+/)
        .filter(Boolean)
        .filter((item) => !INTERNAL_PICKER_CLASSES.has(item))
        .slice(0, 2);
      if (classes.length) {
        segment += classes.map((item) => `.${escapeCssIdent(item, doc)}`).join('');
      }
    }

    if (!node.id && node.parentElement) {
      const sameTagSiblings = Array.from(node.parentElement.children)
        .filter((item) => item.tagName === node.tagName);
      if (sameTagSiblings.length > 1) {
        segment += `:nth-of-type(${sameTagSiblings.indexOf(node) + 1})`;
      }
    }

    segments.unshift(segment);
    const selector = segments.join(' > ');
    if (selectorMatchesElement(doc, selector, el)) return selector;
    if (node.id) break;
    node = node.parentElement;
  }

  return fallbackSelector || el.tagName.toLowerCase();
}

function describeElement(el, selector, eventType) {
  if (!el) return { selector, eventType, summary: selector };
  const tag = el.tagName?.toLowerCase() || 'element';
  const id = el.id ? `#${el.id}` : '';
  const className = typeof el.className === 'string'
    ? el.className
      .split(/\s+/)
      .filter(Boolean)
      .filter((item) => !INTERNAL_PICKER_CLASSES.has(item))
      .slice(0, 4)
      .map((item) => `.${item}`)
      .join('')
    : '';
  const notes = el.getAttribute('data-notes') || '';
  const type = el.getAttribute('data-type') || '';
  const text = compactText(el.innerText || el.getAttribute('alt') || el.getAttribute('aria-label') || '');
  const parts = [
    `selector=${selector}`,
    `tag=${tag}${id}${className}`,
    eventType ? `event=${eventType}` : '',
    type ? `data-type=${type}` : '',
    text ? `text=${text}` : '',
    notes ? `notes=${compactText(notes, 160)}` : ''
  ].filter(Boolean);
  return { selector, eventType, summary: parts.join('；') };
}

export function DesignHtmlAgentPanel({ device, iframeRef, onGenerated }) {
  const currentFile = useAppStore((s) => s.currentFile);
  const isCurrentEditor = useAppStore((s) => s.session.isCurrentEditor);
  const showToast = useAppStore((s) => s.showToast);
  const updateCurrentFile = useAppStore((s) => s.updateCurrentFile);
  const project = useAppStore((s) => s.getCurrentProject());
  const setIsPickerActive = useAppStore((s) => s.setIsPickerActive);
  const setIsColorPickerActive = useAppStore((s) => s.setIsColorPickerActive);

  const isDesignFile = currentFile?.sourceType === 'image' || currentFile?.sourceType === 'psd';
  const hasGeneratedHtml = !!currentFile?.generatedHtmlPath;
  const title = fileTitle(currentFile);

  const initialMessage = useMemo(() => ({
    role: 'assistant',
    content: hasGeneratedHtml
      ? `当前 HTML IR：${currentFile.generatedHtmlPath}`
      : '当前还没有 HTML IR。'
  }), [currentFile?.path, currentFile?.generatedHtmlPath, hasGeneratedHtml]);

  const [messages, setMessages] = useState([initialMessage]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedElements, setSelectedElements] = useState([]);
  const [progress, setProgress] = useState({ message: '', chars: 0, stages: [], elapsedMs: 0 });
  const [collapsed, setCollapsed] = useState(true);
  const operationStartedAtRef = useRef(0);

  useEffect(() => {
    setMessages([initialMessage]);
    setInput('');
    setSelectedElements([]);
    clearIframeSelection(iframeRef.current);
  }, [initialMessage, iframeRef]);

  useEffect(() => () => {
    Picker.disable(iframeRef.current);
    clearIframeSelection(iframeRef.current);
  }, [iframeRef]);

  useEffect(() => {
    if (!busy) return undefined;

    const updateElapsed = () => {
      const startedAt = operationStartedAtRef.current;
      if (!startedAt) return;
      setProgress((prev) => ({ ...prev, elapsedMs: Date.now() - startedAt }));
    };

    updateElapsed();
    const timerId = window.setInterval(updateElapsed, 300);
    return () => window.clearInterval(timerId);
  }, [busy]);

  const applyAgentResult = useCallback((res, assistantText, durationMs) => {
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
        content: assistantText || `已更新 HTML IR：${res.htmlPath}`,
        durationMs,
      }
    ]);
  }, [onGenerated, updateCurrentFile]);

  const resetProgress = () => {
    operationStartedAtRef.current = Date.now();
    setProgress({ message: '准备开始', chars: 0, stages: [], elapsedMs: 0 });
  };

  const getElapsedMs = () => {
    const startedAt = operationStartedAtRef.current;
    return startedAt ? Date.now() - startedAt : 0;
  };

  const handleStreamStage = (payload) => {
    const message = payload?.message || payload?.stage || '处理中';
    setProgress((prev) => ({
      ...prev,
      message,
      stages: [
        ...prev.stages,
        { stage: payload?.stage || message, message, at: payload?.at || new Date().toISOString() }
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
    Picker.disable(iframeRef.current);
    setSelecting(false);
    setBusy(true);
    resetProgress();
    setMessages((items) => [...items, { role: 'user', content: hasGeneratedHtml ? '重新生成 HTML IR' : '生成 HTML IR' }]);
    try {
      const res = await api.generateHtmlIrStream({
        file: currentFile,
        device,
        designSystem: project?.designSystem || null,
      }, streamHandlers);
      if (res.error) throw new Error(res.error);
      applyAgentResult(res, `已生成 HTML IR：${res.htmlPath}`, getElapsedMs());
      showToast('HTML IR 已生成');
    } catch (e) {
      const message = formatAgentError(e, '生成失败');
      setMessages((items) => [...items, { role: 'error', content: message, durationMs: getElapsedMs() }]);
      // showToast(message);
    } finally {
      setBusy(false);
      operationStartedAtRef.current = 0;
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

    Picker.disable(iframeRef.current);
    setSelecting(false);

    const targetText = selectedElements
      .map((item, index) => `${index + 1}. 目标元素：${item.selector}\n   元素信息：${item.summary}`)
      .join('\n');
    const apiInstruction = selectedElements.length > 0
      ? `目标元素列表（共 ${selectedElements.length} 个）：\n${targetText}\n\n修改要求：${instruction}`
      : instruction;
    const displayInstruction = selectedElements.length > 0
      ? `针对 ${selectedElements.length} 个元素：${instruction}`
      : instruction;

    setMessages((items) => [...items, { role: 'user', content: displayInstruction }]);
    setInput('');
    setBusy(true);
    resetProgress();
    try {
      const res = await api.refineHtmlIrStream({
        file: currentFile,
        device,
        designSystem: project?.designSystem || null,
        instruction: apiInstruction,
        history: buildHistory(messages),
      }, streamHandlers);
      if (res.error) throw new Error(res.error);
      applyAgentResult(res, `已按反馈更新 HTML IR：${res.htmlPath}`, getElapsedMs());
      showToast('HTML IR 已更新');
    } catch (e) {
      const message = formatAgentError(e, '调整失败');
      setMessages((items) => [...items, { role: 'error', content: message, durationMs: getElapsedMs() }]);
      showToast(message);
    } finally {
      setBusy(false);
      operationStartedAtRef.current = 0;
    }
  };

  const startElementSelect = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) {
      showToast(hasGeneratedHtml ? 'HTML IR 尚未加载完成' : '请先生成 HTML IR');
      return;
    }
    if (selecting) {
      Picker.disable(iframe);
      setSelecting(false);
      return;
    }

    setIsPickerActive(false);
    setIsColorPickerActive(false);
    ColorPickerModule.disable(iframe);
    Picker.disable(iframe);
    markIframeSelection(iframe, selectedElements);
    setSelecting(true);

    setTimeout(() => {
      if (!iframeRef.current || iframeRef.current !== iframe) return;
      Picker.enable(iframe, (selector, eventType, mouseEvent) => {
        let selected = null;
        try {
          selected = mouseEvent?.target || iframe.contentDocument?.querySelector(selector);
        } catch { }
        const stableSelector = uniqueSelectorForElement(selected, selector);
        const nextElement = describeElement(selected, stableSelector, eventType);
        selected?.classList.add('picker-selected');
        setSelectedElements((items) => {
          if (items.some((item) => item.selector === nextElement.selector)) return items;
          return [...items, nextElement];
        });
      });
    }, 0);
  };

  const removeSelectedElement = (selector) => {
    setSelectedElements((items) => {
      const next = items.filter((item) => item.selector !== selector);
      markIframeSelection(iframeRef.current, next);
      return next;
    });
  };

  const clearSelectedElements = () => {
    clearIframeSelection(iframeRef.current);
    setSelectedElements([]);
  };

  const collapsePanel = () => {
    if (selecting) {
      Picker.disable(iframeRef.current);
      setSelecting(false);
    }
    setCollapsed(true);
  };

  if (collapsed) {
    return (
      <aside className="ai-html-agent-panel ai-html-agent-panel-collapsed" aria-label="AI调整">
        <button
          type="button"
          className="btn btn-icon btn-primary ai-html-agent-panel-expand"
          onClick={() => setCollapsed(false)}
          title="展开 AI 调整"
          aria-label="展开 AI 调整"
        >
          <Icon name="sparkles" size="md" />
          <span>AI</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="ai-html-agent-panel">
      <div className="ai-html-agent-panel-header">
        <div>
          <div className="ai-html-agent-panel-title">
            <Icon name="sparkles" size="sm" />
            <span>AI调整</span>
          </div>
          <div className="ai-html-agent-panel-subtitle">{title}</div>
        </div>
        <div className="ai-html-agent-panel-actions">
          <button
            className="btn btn-sm btn-secondary"
            onClick={generate}
            disabled={busy || !isDesignFile || !isCurrentEditor}
            title={!isCurrentEditor ? '当前为只读' : undefined}
          >
            <Icon name="refresh" size="sm" />
            {hasGeneratedHtml ? '重新生成' : '生成'}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-icon btn-secondary ai-html-agent-panel-collapse"
            onClick={collapsePanel}
            title="收起 AI 调整"
            aria-label="收起 AI 调整"
          >
            <Icon name="chevronRight" size="sm" />
          </button>
        </div>
      </div>

      <div className="ai-html-agent-target-row">
        <div className="ai-html-agent-target-actions">
          <button
            className={`btn btn-sm ${selecting ? 'btn-primary' : 'btn-secondary'}`}
            onClick={startElementSelect}
            disabled={busy || !hasGeneratedHtml || !isCurrentEditor}
            title={!hasGeneratedHtml ? '请先生成 HTML IR' : undefined}
          >
            <Icon name="target" size="sm" />
            {selecting ? '完成选择' : selectedElements.length > 0 ? '继续选择' : '选择元素'}
          </button>
          {selectedElements.length > 0 && (
            <button
              className="btn btn-sm btn-secondary"
              onClick={clearSelectedElements}
              disabled={busy}
              title="清空已选元素"
            >
              <Icon name="trash" size="sm" />
              清空
            </button>
          )}
        </div>
        <div className="ai-html-agent-target-list">
          {selectedElements.length > 0 ? (
            selectedElements.map((item, index) => (
              <button
                className="ai-html-agent-target-chip"
                onClick={() => removeSelectedElement(item.selector)}
                title={item.summary}
                key={item.selector}
              >
                <span>{index + 1}. {item.selector}</span>
                <Icon name="x" size="sm" />
              </button>
            ))
          ) : (
            <span className="ai-html-agent-target-empty">
              {selecting ? '可连续选择多个元素' : '未选择元素'}
            </span>
          )}
        </div>
      </div>

      <div className="ai-html-agent-panel-chat">
        {messages.map((message, index) => (
          <div className={`ai-html-agent-message ${message.role}`} key={`${message.role}-${index}`}>
            <div className="ai-html-agent-message-content">{message.content}</div>
            {Number.isFinite(message.durationMs) && (
              <div className="ai-html-agent-message-meta">
                耗时 {formatDuration(message.durationMs)}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="ai-html-agent-progress">
            <div className="ai-html-agent-progress-head">
              <Icon name="clock" size="sm" />
              <span>{progress.message || '正在调用 AI Agent...'}</span>
            </div>
            {(progress.elapsedMs > 0 || progress.chars > 0) && (
              <div className="ai-html-agent-progress-count">
                {progress.elapsedMs > 0 && <span>已用时 {formatDuration(progress.elapsedMs)}</span>}
                {progress.chars > 0 && <span>已接收 HTML {progress.chars} 字符</span>}
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

      <div className="ai-html-agent-panel-input-row">
        <textarea
          className="form-textarea ai-html-agent-panel-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={selectedElements.length > 0 ? `描述这 ${selectedElements.length} 个元素要怎么调整` : '输入调整说明'}
          disabled={busy || !hasGeneratedHtml || !isCurrentEditor}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') refine();
          }}
        />
        <button
          className="btn btn-primary ai-html-agent-panel-send"
          onClick={refine}
          disabled={busy || !input.trim() || !hasGeneratedHtml || !isCurrentEditor}
        >
          <Icon name="arrowUp" size="sm" />
        </button>
      </div>
    </aside>
  );
}
