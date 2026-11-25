/**
 * 当前 HBuilderX Web list-item 只在首次显示时测量尺寸，异步内容增长后
 * cachedSize 不会失效，回收时会使用旧高度。用可见节点的真实尺寸同步
 * 原组件缓存，并调用原注册流程触发布局；保留 list-view 的节点回收。
 * 仅用于竖向 Web 聊天列表。框架内部接口必须同时存在，否则不接管。
 */
export function observeWebListItemSizes(root) {
  const observed = new Set()
  let disposed = false

  function readItem(element) {
    if (!element.isConnected || !root.contains(element)) return null
    const vm = element.__vueParentComponent
    const status = vm?.exposed?.__listViewChildStatus
    const register = vm?.provides?.__listViewRegisterItem
    const unregister = vm?.provides?.__listViewUnregisterItem
    if (status?.type !== 'ListItem' || !status.visible?.value ||
        typeof register !== 'function' || typeof unregister !== 'function') return null
    return { status, register, unregister }
  }

  function rearrange(item) {
    // 原注册表只管理尺寸状态，实际顺序仍由 list-view 的 VNode 决定。
    // 成对调用不增加注册项；沿用框架自身的防抖重排，不卸载消息组件。
    item.unregister(item.status)
    item.register(item.status)
  }

  const resizeObserver = new ResizeObserver(entries => {
    if (disposed) return
    for (const { target } of entries) {
      const item = readItem(target)
      if (item == null) continue
      const style = getComputedStyle(target)
      const size = target.getBoundingClientRect().height +
        (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0)
      if (!Number.isFinite(size) || size < 0) continue
      if (item.status.cachedSize === size && item.status.cachedSizeUpdated) continue
      item.status.cachedSize = size
      item.status.cachedSizeUpdated = true
      rearrange(item)
    }
  })

  function scan() {
    const next = new Set(root.querySelectorAll('uni-list-item'))
    for (const element of observed) {
      if (next.has(element)) continue
      resizeObserver.unobserve(element)
      observed.delete(element)
    }
    for (const element of next) {
      if (observed.has(element)) continue
      observed.add(element)
      resizeObserver.observe(element)
      const item = readItem(element)
      // 先让框架确认初始估算值，避免首行增长后才首次重排，
      // 将长消息高度误作所有尚未测量行的默认高度。
      if (item != null) rearrange(item)
    }
  }

  function containsItem(node) {
    return node.nodeType === 1 &&
      (node.matches('uni-list-item') || node.querySelector('uni-list-item') != null)
  }

  const mutationObserver = new MutationObserver(records => {
    if (disposed) return
    for (const record of records) {
      if ([...record.addedNodes, ...record.removedNodes].some(containsItem)) {
        scan()
        return
      }
    }
  })
  mutationObserver.observe(root, { childList: true, subtree: true })
  scan()

  return () => {
    disposed = true
    mutationObserver.disconnect()
    resizeObserver.disconnect()
    observed.clear()
  }
}
