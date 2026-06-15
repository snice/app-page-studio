function emitStage(onStage, stage, message, detail = null) {
  if (typeof onStage !== 'function') return;
  onStage(stage, message, detail);
}

function wantsEventStream(req) {
  const accept = String(req.get?.('accept') || '').toLowerCase();
  return req.body?.stream === true || accept.includes('text/event-stream');
}

function createSseWriter(req, res) {
  let closed = false;
  const headers = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  };

  if (typeof res.status === 'function') res.status(200);
  if (typeof res.set === 'function') {
    res.set(headers);
  } else if (typeof res.writeHead === 'function') {
    res.writeHead(200, headers);
  }
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const heartbeat = setInterval(() => {
    if (!closed && !res.destroyed && typeof res.write === 'function') {
      res.write(': keep-alive\n\n');
    }
  }, 15000);

  const close = () => {
    closed = true;
    clearInterval(heartbeat);
  };
  req.on?.('aborted', close);
  res.on?.('close', close);

  function write(event, payload) {
    if (closed || res.destroyed || typeof res.write !== 'function') return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
  }

  return {
    stage(stage, message, detail = null) {
      write('stage', {
        stage,
        message,
        detail,
        at: new Date().toISOString()
      });
    },
    delta(text, chars) {
      write('delta', { text, chars });
    },
    done(payload) {
      write('done', payload);
    },
    error(error) {
      const status = error?.status || 500;
      write('error', {
        status,
        error: error?.message || String(error || 'AI HTML Agent 执行失败')
      });
    },
    end() {
      closed = true;
      clearInterval(heartbeat);
      if (!res.destroyed && typeof res.end === 'function') res.end();
    }
  };
}

module.exports = {
  createSseWriter,
  emitStage,
  wantsEventStream
};
