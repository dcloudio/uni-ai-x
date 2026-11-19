// Diagnostic cloud object. Configure a short-lived nonce before deployment.
// No official DeepSeek credential or business data is used.
const config = require('./probe-config.json')
const models = new Set([
  'deepseek/deepseek-v4.1-flash',
  'bytedance/doubao-seed-2-1-pro',
  'bytedance/doubao-seed-2-1-turbo',
  'z-ai/glm-5.3-flash'
])

function check(nonce) {
  if (nonce !== config.nonce || Date.now() > config.expiresAt) {
    throw new Error('Diagnostic access expired or invalid')
  }
}

module.exports = {
  async readImage({ url, model, nonce }) {
    check(nonce)
    const parsed = new URL(url)
    if (parsed.hostname !== config.fixtureHost || !parsed.pathname.startsWith('/capability-probe-20261118/')) {
      throw new Error('Only generated diagnostic fixtures are allowed')
    }
    if (!models.has(model)) throw new Error('Model not in diagnostic allowlist')
    const manager = uniCloud.ai.getLLMManager({ provider: 'qiniu', appId: this.getClientInfo().appId })
    const credential = await manager.getTempToken()
    const started = Date.now()
    // The only HTTP request is to the inference API. The image is not downloaded.
    const response = await uniCloud.httpclient.request('https://api.qnaigc.com/v1/chat/completions', {
      method: 'POST', contentType: 'json', dataType: 'json', timeout: 55000,
      headers: { Authorization: 'Bearer ' + credential.token },
      data: { model, max_tokens: 2048, stream: false, messages: [{ role: 'user', content: [
        { type: 'text', text: '请逐字抄写图片中所有文字。只输出原文，不要解释。' },
        { type: 'image_url', image_url: { url } }
      ] }] }
    })
    const data = response.data
    return {
      status: response.status, seconds: (Date.now() - started) / 1000,
      model, imageTransport: 'url-only', imageDownloadedByFunction: false,
      answer: data.choices?.[0]?.message?.content ?? '', usage: data.usage,
      error: data.error ?? null
    }
  },
  async cleanup({ nonce }) {
    check(nonce)
    return await uniCloud.deleteFile({ fileList: config.fileIDs })
  }
}
