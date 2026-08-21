(function (global) {
  const MAX_RASTER_SCALE = 3;
  const MERMAID_NODE_TEXT_OFFSET = 16;

  function normalizedRasterScale(value) {
    const scale = Number(value || 1);
    return Number.isFinite(scale)
      ? Math.max(1, Math.min(scale, MAX_RASTER_SCALE))
      : 1;
  }

  function applyDecodeScale(svgElement, rasterScaleValue) {
    const rasterScale = normalizedRasterScale(rasterScaleValue);
    if (rasterScale === 1) return;
    ['width', 'height'].forEach(attributeName => {
      const value = svgElement.getAttribute(attributeName) || '';
      const match = value.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(px)?$/i);
      if (match == null) return;
      svgElement.setAttribute(
        attributeName,
        (Number(match[1]) * rasterScale).toString() + (match[2] || '')
      );
    });
  }

  function inlineComputedStyles(svgElement) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-100000px;top:0;pointer-events:none;';
    const liveSvg = document.importNode(svgElement, true);
    host.appendChild(liveSvg);
    document.body.appendChild(host);
    try {
      const styleProperties = [
        'color', 'fill', 'fill-opacity', 'fill-rule',
        'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
        'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
        'stroke-dashoffset', 'opacity', 'font-family', 'font-size',
        'font-style', 'font-weight', 'letter-spacing', 'text-anchor',
        'dominant-baseline', 'alignment-baseline', 'paint-order',
        'stop-color', 'stop-opacity', 'vector-effect'
      ];
      const paintedNodes = liveSvg.querySelectorAll(
        'path,rect,circle,ellipse,polygon,polyline,line,text,tspan,marker,stop'
      );
      paintedNodes.forEach(node => {
        const computedStyle = global.getComputedStyle(node);
        styleProperties.forEach(property => {
          const value = computedStyle.getPropertyValue(property).trim();
          if (value.length > 0) node.setAttribute(property, value);
        });
      });
      liveSvg.querySelectorAll('style').forEach(node => node.remove());
      return liveSvg;
    } finally {
      host.remove();
    }
  }

  function offsetMermaidNodeText(svgElement) {
    svgElement.querySelectorAll('.node text').forEach(node => {
      const parentNode = node.parentNode;
      if (parentNode == null) return;
      const wrapper = svgElement.ownerDocument.createElementNS(
        'http://www.w3.org/2000/svg',
        'g'
      );
      wrapper.setAttribute('transform', 'translate(0 ' + MERMAID_NODE_TEXT_OFFSET.toString() + ')');
      parentNode.insertBefore(wrapper, node);
      wrapper.appendChild(node);
    });
    return svgElement;
  }

  function prepareForDecode(svgElement, options) {
    let preparedSvgElement = svgElement;
    if (options.inlineComputedStyles === true || options.harmonyWorkaround === true) {
      preparedSvgElement = inlineComputedStyles(preparedSvgElement);
    }
    if (options.offsetMermaidNodeText === true || options.harmonyWorkaround === true) {
      preparedSvgElement = offsetMermaidNodeText(preparedSvgElement);
    }
    return preparedSvgElement;
  }

  global.harmonySvgWorkaround = Object.freeze({
    applyDecodeScale,
    prepareForDecode
  });
})(window);
