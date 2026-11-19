// Run this async function in the project's Web page. Never records credentials.
async () => {
  const module = await import('/uni_modules/uni-ai-x/sdk/index.uts?import')
  const state = window.__uiTest = { ai: module.uniAi || module.default, requests: [], toasts: [], modals: [], cases: [] }
  const summarize = (url, body) => {
    if (!/https:\/\/api\.(qnaigc|deepseek)\.com\//.test(url)) return null
    let parsed
    try { parsed = JSON.parse(body) } catch (_) { }
    const item = { url, model: parsed?.model, thinking: parsed?.thinking, safety: parsed?.safety_check,
      tools: parsed?.tools?.map(tool => tool.type === 'function' ? tool.function?.name : tool.type), started: Date.now() }
    state.requests.push(item)
    return item
  }
  state.fetch = window.fetch
  window.fetch = async function(input, init) {
    const item = summarize(typeof input === 'string' ? input : input.url, init?.body)
    try {
      const response = await state.fetch.apply(this, arguments)
      if (item) { item.status = response.status; item.ms = Date.now() - item.started }
      return response
    } catch (error) { if (item) item.error = String(error); throw error }
  }
  state.open = XMLHttpRequest.prototype.open
  state.send = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this.__capabilityUrl = String(url)
    return state.open.call(this, method, url, ...args)
  }
  XMLHttpRequest.prototype.send = function(body) {
    const item = summarize(this.__capabilityUrl, body)
    if (item) this.addEventListener('loadend', () => { item.status = this.status; item.ms = Date.now() - item.started })
    return state.send.call(this, body)
  }
  state.toast = uni.showToast
  uni.showToast = function(options) { state.toasts.push({ title: options.title }); return state.toast.call(this, options) }
  state.modal = uni.showModal
  uni.showModal = function(options) { state.modals.push({ title: options.title, content: options.content }); return state.modal.call(this, options) }
  state.restore = () => {
    window.fetch = state.fetch; XMLHttpRequest.prototype.open = state.open; XMLHttpRequest.prototype.send = state.send
    uni.showToast = state.toast; uni.showModal = state.modal
  }
  return { provider: state.ai.llm.provider, model: state.ai.llm.model }
}
