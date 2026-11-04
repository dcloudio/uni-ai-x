(function (global) {
  const MAX_RASTER_SCALE = 3;

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

  function withMountedSvgClone(svgElement, callback) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-100000px;top:0;pointer-events:none;';
    const liveSvg = document.importNode(svgElement, true);
    host.appendChild(liveSvg);
    document.body.appendChild(host);
    try {
      callback(liveSvg);
      return liveSvg;
    } finally {
      host.remove();
    }
  }

  function inlineComputedStyles(svgElement) {
    return withMountedSvgClone(svgElement, liveSvg => {
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
    });
  }

  function directChildWithClass(element, className) {
    return Array.from(element.children).find(child => child.classList.contains(className)) || null;
  }

  function directChildrenByTagName(element, tagName) {
    return Array.from(element.children).filter(child => child.tagName.toLowerCase() === tagName);
  }

  function parsedTranslate(transformValue) {
    const number = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?';
    const match = (transformValue || '').trim().match(new RegExp(
      '^translate\\(\\s*(' + number + ')(?:\\s*,\\s*|\\s+)(' + number + ')\\s*\\)$'
    ));
    if (match == null) return null;
    const x = Number(match[1]);
    const y = Number(match[2]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  function formattedSvgNumber(value) {
    const rounded = Math.round(value * 1000) / 1000;
    return Object.is(rounded, -0) ? '0' : rounded.toString();
  }

  function parsedSvgNumberAttribute(element, attributeName, fallbackValue) {
    const value = element.getAttribute(attributeName);
    if (value == null || value.trim().length === 0) return fallbackValue;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function inlineStyleProperties(element, properties) {
    const computedStyle = global.getComputedStyle(element);
    properties.forEach(property => {
      const value = computedStyle.getPropertyValue(property).trim();
      if (value.length > 0) element.style.setProperty(property, value);
    });
  }

  function inlinePresentationAttributes(element, properties) {
    const computedStyle = global.getComputedStyle(element);
    properties.forEach(property => {
      const value = computedStyle.getPropertyValue(property).trim();
      if (value.length > 0) element.setAttribute(property, value);
    });
  }

  function parsedOpacity(value, fallbackValue) {
    const parsed = Number.parseFloat((value || '').trim());
    return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 1)) : fallbackValue;
  }

  function inlineIOSNodeShapeStyles(liveSvg) {
    liveSvg.querySelectorAll('.node > rect.label-container, .node > polygon.label-container').forEach(node => {
      inlineStyleProperties(node, ['fill', 'stroke', 'stroke-width']);
    });
  }

  function normalizeSingleLineNodeLabels(liveSvg) {
    liveSvg.querySelectorAll('.node').forEach(node => {
      const label = directChildWithClass(node, 'label');
      if (label == null) return;
      const textNodes = directChildrenByTagName(label, 'text');
      if (textNodes.length !== 1) return;
      const textNode = textNodes[0];
      const tspans = directChildrenByTagName(textNode, 'tspan');
      if (tspans.length !== 1) return;
      const tspan = tspans[0];
      const x = (tspan.getAttribute('x') || '').trim();
      const dy = (tspan.getAttribute('dy') || '').trim();
      if (x !== '0' || dy !== '1em') return;

      const translate = parsedTranslate(label.getAttribute('transform'));
      const fontSize = Number.parseFloat(global.getComputedStyle(textNode).fontSize);
      if (translate == null || !Number.isFinite(fontSize) || fontSize <= 0) return;

      label.setAttribute(
        'transform',
        'translate(' + formattedSvgNumber(translate.x) + ', '
          + formattedSvgNumber(translate.y + fontSize) + ')'
      );
      tspan.removeAttribute('x');
      tspan.removeAttribute('dy');
    });
  }

  function normalizeMermaidNodeText(svgElement) {
    return withMountedSvgClone(svgElement, liveSvg => {
      normalizeSingleLineNodeLabels(liveSvg);
    });
  }

  function normalizeSingleLineEdgeLabels(liveSvg) {
    liveSvg.querySelectorAll('.edgeLabel').forEach(edgeLabel => {
      const edgeTranslate = parsedTranslate(edgeLabel.getAttribute('transform'));
      const label = directChildWithClass(edgeLabel, 'label');
      if (edgeTranslate == null || label == null) return;
      const labelTranslate = parsedTranslate(label.getAttribute('transform'));
      const rects = directChildrenByTagName(label, 'rect');
      const textNodes = directChildrenByTagName(label, 'text');
      if (labelTranslate == null || rects.length !== 1 || textNodes.length !== 1) return;

      const rect = rects[0];
      const textNode = textNodes[0];
      const tspans = directChildrenByTagName(textNode, 'tspan');
      if (tspans.length !== 1) return;
      const tspan = tspans[0];
      const x = (tspan.getAttribute('x') || '').trim();
      const dy = (tspan.getAttribute('dy') || '').trim();
      if (x !== '0' || dy !== '1em' || (tspan.textContent || '').length === 0) return;

      const rectX = parsedSvgNumberAttribute(rect, 'x', 0);
      const rectY = parsedSvgNumberAttribute(rect, 'y', 0);
      const fontSize = Number.parseFloat(global.getComputedStyle(textNode).fontSize);
      if (rectX == null || rectY == null || !Number.isFinite(fontSize) || fontSize <= 0) return;

      const rectComputedStyle = global.getComputedStyle(rect);
      const effectiveFillOpacity = parsedOpacity(rectComputedStyle.opacity, 1)
        * parsedOpacity(rectComputedStyle.fillOpacity, 1);
      const labelX = edgeTranslate.x + labelTranslate.x;
      const labelY = edgeTranslate.y + labelTranslate.y;
      rect.setAttribute('x', formattedSvgNumber(labelX + rectX));
      rect.setAttribute('y', formattedSvgNumber(labelY + rectY));
      inlineStyleProperties(rect, ['fill']);
      rect.style.setProperty('opacity', '1');
      rect.style.setProperty('fill-opacity', formattedSvgNumber(effectiveFillOpacity));
      rect.setAttribute('opacity', '1');
      rect.setAttribute('fill-opacity', formattedSvgNumber(effectiveFillOpacity));
      edgeLabel.style.setProperty('opacity', '1');
      edgeLabel.setAttribute('opacity', '1');
      label.style.setProperty('opacity', '1');
      label.setAttribute('opacity', '1');

      const textWrapper = liveSvg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
      textWrapper.setAttribute(
        'transform',
        'translate(' + formattedSvgNumber(labelX) + ', '
          + formattedSvgNumber(labelY + fontSize) + ')'
      );
      label.insertBefore(textWrapper, textNode);
      textWrapper.appendChild(textNode);
      inlineStyleProperties(textNode, [
        'fill', 'font-family', 'font-size', 'font-style', 'font-weight',
        'letter-spacing', 'text-anchor'
      ]);
      inlineStyleProperties(tspan, [
        'fill', 'font-family', 'font-size', 'font-style', 'font-weight',
        'letter-spacing', 'text-anchor'
      ]);
      inlinePresentationAttributes(textNode, [
        'fill', 'font-family', 'font-size', 'font-style', 'font-weight',
        'letter-spacing', 'text-anchor'
      ]);
      inlinePresentationAttributes(tspan, [
        'fill', 'font-family', 'font-size', 'font-style', 'font-weight',
        'letter-spacing', 'text-anchor'
      ]);
      tspan.removeAttribute('x');
      tspan.removeAttribute('dy');
      edgeLabel.removeAttribute('transform');
      label.removeAttribute('transform');
    });
  }

  function normalizeMermaidEdgeLabels(svgElement) {
    return withMountedSvgClone(svgElement, liveSvg => {
      normalizeSingleLineEdgeLabels(liveSvg);
    });
  }

  function pointEndMarkerId(markerEnd) {
    const match = (markerEnd || '').match(/^url\(["']?#([^"')]+)["']?\)$/);
    if (match == null || !match[1].endsWith('_flowchart-pointEnd')) return '';
    return match[1];
  }

  function markerViewBox(marker) {
    const values = (marker.getAttribute('viewBox') || '')
      .trim()
      .split(/[\s,]+/)
      .map(value => Number(value));
    if (values.length !== 4 || values.some(value => !Number.isFinite(value))) return null;
    if (values[2] <= 0 || values[3] <= 0) return null;
    return { width: values[2], height: values[3] };
  }

  function markerViewportScale(marker, markerPath, linkPath) {
    const viewBox = markerViewBox(marker);
    const markerWidth = parsedSvgNumberAttribute(marker, 'markerWidth', 3);
    const markerHeight = parsedSvgNumberAttribute(marker, 'markerHeight', 3);
    if (viewBox == null || markerWidth == null || markerHeight == null
        || markerWidth <= 0 || markerHeight <= 0) return null;

    let scaleX = markerWidth / viewBox.width;
    let scaleY = markerHeight / viewBox.height;
    const preserveAspectRatio = (marker.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim();
    if (!preserveAspectRatio.split(/\s+/).includes('none')) {
      const scale = preserveAspectRatio.split(/\s+/).includes('slice')
        ? Math.max(scaleX, scaleY)
        : Math.min(scaleX, scaleY);
      scaleX = scale;
      scaleY = scale;
    }

    const markerUnits = (marker.getAttribute('markerUnits') || 'strokeWidth').trim();
    if (markerUnits === 'strokeWidth') {
      const strokeWidth = Number.parseFloat(global.getComputedStyle(linkPath).strokeWidth);
      if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) return null;
      scaleX *= strokeWidth;
      scaleY *= strokeWidth;
    } else if (markerUnits !== 'userSpaceOnUse') {
      return null;
    }

    if (markerPath.hasAttribute('transform')) return null;
    return { x: scaleX, y: scaleY };
  }

  function pointEndMarkerPoints(marker, markerPath, linkPath) {
    const refX = parsedSvgNumberAttribute(marker, 'refX', 0);
    const refY = parsedSvgNumberAttribute(marker, 'refY', 0);
    const scale = markerViewportScale(marker, markerPath, linkPath);
    if (refX == null || refY == null || scale == null
        || typeof markerPath.getBBox !== 'function') return null;

    let bounds;
    try {
      bounds = markerPath.getBBox();
    } catch (_error) {
      return null;
    }
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(value => Number.isFinite(value))
        || bounds.width <= 0 || bounds.height <= 0) return null;

    const baseX = bounds.x;
    const tipX = bounds.x + bounds.width;
    const centerY = bounds.y + bounds.height / 2;
    return [
      { forward: (tipX - refX) * scale.x, lateral: (centerY - refY) * scale.y },
      { forward: (baseX - refX) * scale.x, lateral: (bounds.y - refY) * scale.y },
      {
        forward: (baseX - refX) * scale.x,
        lateral: (bounds.y + bounds.height - refY) * scale.y
      }
    ];
  }

  function materializePointEndMarkers(liveSvg) {
    liveSvg.querySelectorAll('.flowchart-link[marker-end]').forEach(path => {
      const markerId = pointEndMarkerId(path.getAttribute('marker-end'));
      const marker = markerId.length > 0
        ? Array.from(liveSvg.querySelectorAll('marker')).find(node => node.id === markerId) || null
        : null;
      const markerPath = marker == null ? null : marker.querySelector('path.arrowMarkerPath');
      if (markerPath == null || typeof path.getTotalLength !== 'function'
          || typeof path.getPointAtLength !== 'function') return;
      const markerPoints = pointEndMarkerPoints(marker, markerPath, path);
      if (markerPoints == null) return;

      const totalLength = path.getTotalLength();
      if (!Number.isFinite(totalLength) || totalLength <= 0) return;
      const anchor = path.getPointAtLength(totalLength);
      const previous = path.getPointAtLength(Math.max(0, totalLength - Math.min(1, totalLength)));
      const dx = anchor.x - previous.x;
      const dy = anchor.y - previous.y;
      const tangentLength = Math.hypot(dx, dy);
      if (!Number.isFinite(tangentLength) || tangentLength <= 0) return;

      const unitX = dx / tangentLength;
      const unitY = dy / tangentLength;
      const points = markerPoints.map(point => {
        const x = anchor.x + unitX * point.forward - unitY * point.lateral;
        const y = anchor.y + unitY * point.forward + unitX * point.lateral;
        return formattedSvgNumber(x) + ',' + formattedSvgNumber(y);
      }).join(' ');

      const polygon = liveSvg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const stroke = global.getComputedStyle(path).stroke.trim();
      polygon.setAttribute('fill', stroke.length > 0 && stroke !== 'none' ? stroke : '#333333');
      polygon.setAttribute('stroke', 'none');
      polygon.setAttribute('points', points);
      path.removeAttribute('marker-end');
      path.parentNode.insertBefore(polygon, path.nextSibling);
    });
  }

  function materializeMermaidPointEndMarkers(svgElement) {
    return withMountedSvgClone(svgElement, liveSvg => {
      materializePointEndMarkers(liveSvg);
    });
  }

  function applyIOSCoreSvgCompatibility(svgElement) {
    return withMountedSvgClone(svgElement, liveSvg => {
      inlineIOSNodeShapeStyles(liveSvg);
      normalizeSingleLineNodeLabels(liveSvg);
      normalizeSingleLineEdgeLabels(liveSvg);
    });
  }

  function prepareForDecode(svgElement, options) {
    let preparedSvgElement = svgElement;
    if (options.inlineComputedStyles === true || options.harmonyWorkaround === true) {
      preparedSvgElement = inlineComputedStyles(preparedSvgElement);
    }
    if (options.normalizeMermaidNodeText === true || options.harmonyWorkaround === true) {
      preparedSvgElement = normalizeMermaidNodeText(preparedSvgElement);
    }
    if (options.normalizeMermaidEdgeLabels === true || options.harmonyWorkaround === true) {
      preparedSvgElement = normalizeMermaidEdgeLabels(preparedSvgElement);
    }
    if (options.iosCoreSvgCompatibility === true) {
      preparedSvgElement = applyIOSCoreSvgCompatibility(preparedSvgElement);
    }
    if (options.materializeMermaidPointEndMarkers === true || options.harmonyWorkaround === true) {
      preparedSvgElement = materializeMermaidPointEndMarkers(preparedSvgElement);
    }
    return preparedSvgElement;
  }

  global.harmonySvgWorkaround = Object.freeze({
    applyDecodeScale,
    prepareForDecode
  });
})(window);
