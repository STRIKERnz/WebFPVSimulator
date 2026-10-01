/* Customisable FPV crosshair and transmitter input display.
 * Part of WebFPVSimulator, GPL-3.0-or-later; see LICENSE. */
import { stickChannels, stickCaption } from '../input/stickmode.js';

export const CROSSHAIRS = ['off', 'wings', 'cross', 'gap', 'dot', 'circle', 'circle-dot', 'chevron', 'corners'];
export const OVERLAY_COLOURS = ['#ffffff', '#ffcc45', '#5ee5ff', '#7cff8b', '#ff719c', '#b49aff', '#ff954f'];
export const OVERLAY_DEFAULTS = {
  crosshair: 'off', crosshairColour: '#ffffff', crosshairSize: 24,
  crosshairOpacity: 85, crosshairThickness: 2,
  stickOverlay: true, stickOverlayShape: 'square', stickOverlaySize: 110,
  stickMarkerSize: 5,
  stickOverlayOpacity: 80, stickLeftColour: '#ffcc45', stickRightColour: '#5ee5ff',
  stickTrails: true, stickTrailLength: 700, stickTrailWidth: 3,
  stickOverlayLabels: false,
  throttleDisplay: 'bar', throttleLabelStyle: 'name', throttleX: 90, throttleY: 24,
  osdLayout: {},
};

export const MOVABLE_OSD = ['timer', 'pack', 'speed', 'sticks', 'weight'];

export function placeOsdElement(node, point) {
  if (!node) return;
  if (point) {
    node.style.left = `${point.x}%`;
    node.style.top = `${point.y}%`;
    node.style.right = 'auto';
    node.style.bottom = 'auto';
    node.style.transform = 'translate(-50%, -50%)';
  } else {
    for (const prop of ['left', 'top', 'right', 'bottom', 'transform']) node.style.removeProperty(prop);
  }
}

export function normaliseOverlaySettings(s) {
  const layout = s.osdLayout && typeof s.osdLayout === 'object' && !Array.isArray(s.osdLayout)
    ? s.osdLayout : {};
  s.osdLayout = {};
  for (const id of MOVABLE_OSD) {
    const point = layout[id];
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      s.osdLayout[id] = { x: Math.max(5, Math.min(95, point.x)), y: Math.max(5, Math.min(95, point.y)) };
    }
  }
  if (!CROSSHAIRS.includes(s.crosshair)) s.crosshair = OVERLAY_DEFAULTS.crosshair;
  if (!['square', 'circle'].includes(s.stickOverlayShape)) s.stickOverlayShape = 'square';
  if (!['off', 'bar', 'percent'].includes(s.throttleDisplay)) s.throttleDisplay = OVERLAY_DEFAULTS.throttleDisplay;
  if (!['name', 'short', 'icon'].includes(s.throttleLabelStyle)) s.throttleLabelStyle = OVERLAY_DEFAULTS.throttleLabelStyle;
  for (const key of ['crosshairColour', 'stickLeftColour', 'stickRightColour']) {
    if (!/^#[0-9a-f]{6}$/i.test(s[key])) s[key] = OVERLAY_DEFAULTS[key];
  }
  for (const [key, lo, hi] of [
    ['crosshairSize', 10, 60], ['crosshairOpacity', 10, 100], ['crosshairThickness', 1, 5],
    ['stickOverlaySize', 60, 160], ['stickOverlayOpacity', 10, 100],
    ['stickMarkerSize', 2, 12],
    ['stickTrailLength', 100, 2000], ['stickTrailWidth', 1, 6],
    ['throttleX', 5, 95], ['throttleY', 5, 95],
  ]) {
    s[key] = Number.isFinite(s[key]) ? Math.max(lo, Math.min(hi, s[key])) : OVERLAY_DEFAULTS[key];
  }
  return s;
}

export function stickPositions(ch, mode) {
  const layout = stickChannels(mode);
  const clamp = v => Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
  return ['left', 'right'].map(side => {
    const m = layout[side];
    return { x: clamp(ch[m.horiz]), y: clamp(m.vert === 'throttle' ? ch.throttle * 2 - 1 : -ch.pitch) };
  });
}

const NS = 'http://www.w3.org/2000/svg';
function svgElement(tag, attributes) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

export class FlightOverlay {
  constructor(host) {
    this.crosshair = svgElement('svg', { class: 'fpv-crosshair', viewBox: '-16 -16 32 32', 'aria-hidden': 'true' });
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fpv-stick-overlay';
    this.canvas.setAttribute('aria-label', 'Live transmitter stick positions');
    this.ctx = this.canvas.getContext('2d');
    this.history = [[], []];
    this.lastSample = -Infinity;
    host.append(this.crosshair, this.canvas);
    this.hide();
  }

  hide() {
    this.crosshair.style.display = 'none';
    this.canvas.style.display = 'none';
    this.clearTrails();
  }

  clearTrails() {
    this.history[0].length = this.history[1].length = 0;
    this.lastSample = -Infinity;
  }

  update(show, channels, settings, now = performance.now()) {
    if (!show) { this.hide(); return; }
    const s = settings;
    this.crosshair.style.display = s.crosshair === 'off' ? 'none' : '';
    const crossKey = [s.crosshair, s.crosshairColour, s.crosshairSize, s.crosshairOpacity, s.crosshairThickness].join('|');
    if (crossKey !== this.crossKey) {
      this.crossKey = crossKey;
      this.crosshair.replaceChildren();
      this.crosshair.style.width = this.crosshair.style.height = `${s.crosshairSize}px`;
      this.crosshair.style.color = s.crosshairColour;
      this.crosshair.style.opacity = s.crosshairOpacity / 100;
      const paths = {
        wings: 'M-14 0H-5M5 0H14', cross: 'M-12 0H12M0-12V12', gap: 'M-14 0H-5M5 0H14M0-14V-5M0 5V14',
        chevron: 'M-11 7L0-5L11 7', corners: 'M-13-5V-13H-5M5-13H13V-5M13 5V13H5M-5 13H-13V5',
      };
      if (paths[s.crosshair]) this.crosshair.append(svgElement('path', {
        d: paths[s.crosshair], fill: 'none', stroke: 'currentColor', 'stroke-width': s.crosshairThickness,
        'stroke-linecap': 'round',
      }));
      if (['circle', 'circle-dot'].includes(s.crosshair)) this.crosshair.append(svgElement('circle', {
        r: 10, fill: 'none', stroke: 'currentColor', 'stroke-width': s.crosshairThickness,
      }));
      if (['wings', 'dot', 'circle-dot'].includes(s.crosshair)) this.crosshair.append(svgElement('circle', {
        r: Math.max(1.5, s.crosshairThickness), fill: 'currentColor',
      }));
    }
    this.canvas.style.display = s.stickOverlay ? '' : 'none';
    placeOsdElement(this.canvas, s.osdLayout.sticks);
    if (!s.stickOverlay || !this.ctx) { this.clearTrails(); return; }
    const size = s.stickOverlaySize;
    /* The stick centres may reach the panel rim. Give the bitmap room for
       the whole marker and shadow outside that rim, on every side. */
    const gutter = s.stickMarkerSize + 8;
    const width = size * 2 + 32 + gutter * 2;
    const height = size + (s.stickOverlayLabels ? 24 : 8) + gutter * 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const key = [size, height, dpr, s.stickMode, s.stickTrails, s.stickTrailLength, s.stickOverlayShape].join('|');
    if (key !== this.stickKey) {
      this.stickKey = key;
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.canvas.parentElement.style.setProperty('--fpv-stick-size', `${height}px`);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.clearTrails();
    }
    this.canvas.style.opacity = s.stickOverlayOpacity / 100;
    const positions = stickPositions(channels, s.stickMode);
    if (s.stickTrails && now - this.lastSample >= 1000 / 30) {
      for (let i = 0; i < 2; i++) {
        const h = this.history[i];
        h.push({ ...positions[i], at: now });
        while (h.length > 64 || (h.length && now - h[0].at > s.stickTrailLength)) h.shift();
      }
      this.lastSample = now;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < 2; i++) {
      const x0 = gutter + i * (size + 32) + size / 2;
      const y0 = gutter + size / 2;
      const radius = size / 2 - 7;
      const travelRadius = radius + 3;
      const colour = i === 0 ? s.stickLeftColour : s.stickRightColour;
      const point = p => {
        // A circular panel uses a circular travel boundary, so diagonals
        // stay inside the rim rather than drawing the dot outside it.
        const scale = s.stickOverlayShape === 'circle' ? Math.max(1, Math.hypot(p.x, p.y)) : 1;
        return { x: x0 + p.x / scale * travelRadius, y: y0 - p.y / scale * travelRadius };
      };
      ctx.save();
      ctx.beginPath();
      if (s.stickOverlayShape === 'circle') ctx.arc(x0, y0, radius + 3, 0, Math.PI * 2);
      else ctx.roundRect(x0 - radius - 3, y0 - radius - 3, (radius + 3) * 2, (radius + 3) * 2, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0-radius,y0);ctx.lineTo(x0+radius,y0);
      ctx.moveTo(x0,y0-radius);ctx.lineTo(x0,y0+radius);ctx.stroke();
      ctx.strokeStyle = colour;ctx.lineWidth = s.stickTrailWidth;ctx.lineCap = 'round';
      const h = this.history[i];
      for (let j = 1; s.stickTrails && j < h.length; j++) {
        const alpha = Math.max(0, 1 - (now - h[j - 1].at) / s.stickTrailLength);
        if (!alpha) continue;
        ctx.globalAlpha = alpha * 0.8;
        const a = point(h[j-1]), b = point(h[j]);
        ctx.beginPath();ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const pos = point(positions[i]);
      ctx.beginPath();ctx.arc(pos.x,pos.y,s.stickMarkerSize,0,Math.PI*2);
      ctx.fillStyle = colour;ctx.shadowColor = 'rgba(0,0,0,.8)';ctx.shadowBlur = 5;ctx.fill();
      ctx.shadowBlur = 0;ctx.strokeStyle = 'rgba(0,0,0,.7)';ctx.lineWidth = 1.5;ctx.stroke();
      if (s.stickOverlayLabels) {
        ctx.font = '10px sans-serif';ctx.textAlign = 'center';ctx.fillStyle = '#ffffff';
        ctx.fillText(stickCaption(s.stickMode, i === 0 ? 'left' : 'right').toUpperCase(), x0, gutter+size+15);
      }
      ctx.restore();
    }
  }
}
