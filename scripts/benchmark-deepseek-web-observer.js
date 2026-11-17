// Evaluate this function in the logged-in DeepSeek tab before sending via the UI.
// It records timing and response data, without changing requests or credentials.
() => {
  if (window.__dsBench) throw Error('Observer already installed');
  const s = window.__dsBench = {runs: [], xhrOpen: XMLHttpRequest.prototype.open,
    xhrSend: XMLHttpRequest.prototype.send};
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__benchUrl = String(url);
    return s.xhrOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function(body) {
    if (!/chat\/completion/.test(this.__benchUrl)) return s.xhrSend.call(this, body);
    const xhrStart = performance.now();
    const run = {start: s.clickStart ?? xhrStart, startedAt: new Date().toISOString(),
      xhr_start_after_click_s: s.clickStart == null ? null : (xhrStart-s.clickStart)/1000,
      chunks: [], done: false, first_thinking_render_s: null, first_content_render_s: null};
    s.clickStart = null;
    try {
      const request = JSON.parse(body);
      run.settings = Object.fromEntries(Object.entries(request).filter(([k]) =>
        /thinking|search|model/.test(k)));
    } catch (_) {}
    s.runs.push(run);
    let offset = 0;
    const observe = () => {
      const t = (performance.now() - run.start) / 1000;
      if (run.first_thinking_render_s == null && document.querySelector('.ds-think-content .ds-markdown')?.textContent.length)
        run.first_thinking_render_s = t;
      if (run.first_content_render_s == null && document.querySelector('.ds-assistant-message-main-content')?.textContent.length)
        run.first_content_render_s = t;
    };
    const observer = new MutationObserver(observe);
    observer.observe(document.body, {subtree: true, characterData: true, childList: true});
    this.addEventListener('progress', () => {
      const text = this.responseText;
      if (text.length > offset) {
        run.chunks.push({t: (performance.now()-run.start)/1000, text: text.slice(offset)});
        offset = text.length;
      }
    });
    this.addEventListener('loadend', () => {
      run.total_s = (performance.now()-run.start)/1000;
      run.status = this.status;
      run.done = true;
      run.pageUrl = location.href;
      run.raw = this.responseText;
      setTimeout(() => { observe(); observer.disconnect(); }, 1000);
    });
    return s.xhrSend.call(this, body);
  };
  return {installed: true};
}
