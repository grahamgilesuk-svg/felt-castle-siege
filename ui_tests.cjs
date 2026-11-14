'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'felt_castle_siege.html'), 'utf8');

function extractScript(id) {
  const match = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'));
  if (!match) throw new Error('script not found in HTML: ' + id);
  return match[1];
}

const coreSrc = extractScript('felt-siege-core');
const uiSrc = extractScript('felt-siege-ui');

class FakeElement {
  constructor(tag, doc, id) {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = id || '';
    this.ownerDocument = doc;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this._listeners = Object.create(null);
    this._attrs = Object.create(null);
    this._classes = new Set();
    this.textContent = '';
    this._innerHTML = '';
    this.value = '';
    this.disabled = false;
    this.hidden = false;
    this.open = false;
    this.checked = false;
    this.selected = false;
    const self = this;
    this.classList = {
      add: (...names) => names.forEach((n) => self._classes.add(n)),
      remove: (...names) => names.forEach((n) => self._classes.delete(n)),
      toggle: (name, force) => {
        const target = force === undefined ? !self._classes.has(name) : !!force;
        if (target) self._classes.add(name);
        else self._classes.delete(name);
        return target;
      },
      contains: (name) => self._classes.has(name)
    };
  }
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this._listeners[type];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  dispatchEvent(event) {
    event = event || {};
    event.target = event.target || this;
    if (typeof event.preventDefault !== 'function') {
      event.preventDefault = () => { event.defaultPrevented = true; };
    }
    const list = (this._listeners[event.type] || []).slice();
    for (const fn of list) fn(event);
    return !event.defaultPrevented;
  }
  focus() {
    this.ownerDocument.activeElement = this;
    this.ownerDocument.focusLog.push(this.id || this.tagName);
  }
  blur() {}
  setAttribute(name, value) {
    this._attrs[name] = String(value);
  }
  getAttribute(name) {
    return name in this._attrs ? this._attrs[name] : null;
  }
  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 1100, height: 620 };
  }
  click() {
    this.dispatchEvent({ type: 'click' });
  }
  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(value) {
    this._innerHTML = String(value);
    this.children.length = 0;
  }
  showModal() {
    this.open = true;
    this.ownerDocument.modalLog.push('showModal');
  }
  close() {
    this.open = false;
    this.ownerDocument.modalLog.push('close');
  }
}

function makeCtx2D() {
  const store = {};
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
        return (target[prop] = function () { return { addColorStop() {} }; });
      }
      if (prop === 'measureText') return (target[prop] = function () { return { width: 10 }; });
      return (target[prop] = function () {});
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

class FakeCanvas extends FakeElement {
  constructor(doc) {
    super('canvas', doc, 'game-canvas');
    this.width = 1100;
    this.height = 620;
  }
  getContext() {
    if (!this._ctx) this._ctx = makeCtx2D();
    return this._ctx;
  }
  setPointerCapture(id) {
    this.ownerDocument.captureLog.push(['capture', id]);
  }
  releasePointerCapture(id) {
    this.ownerDocument.captureLog.push(['release', id]);
  }
}

function makeDocument(storageImpl) {
  const doc = new FakeElement('#document', null);
  doc.ownerDocument = doc;
  doc.readyState = 'complete';
  doc.hidden = false;
  doc.activeElement = null;
  doc.focusLog = [];
  doc.modalLog = [];
  doc.captureLog = [];
  doc.localStorage = storageImpl;
  doc.elements = Object.create(null);
  doc.getElementById = (id) => {
    if (!doc.elements[id]) {
      const el = id === 'game-canvas' ? new FakeCanvas(doc) : new FakeElement('div', doc, id);
      doc.elements[id] = el;
    }
    return doc.elements[id];
  };
  doc.createElement = (tag) => new FakeElement(tag, doc);
  return doc;
}

function memoryStorage(initial) {
  const store = Object.create(null);
  if (initial) Object.assign(store, initial);
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };
}

function failingStorage() {
  return {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); }
  };
}

function boot(options) {
  options = options || {};
  const doc = makeDocument(options.storage);
  const rafQueue = [];
  let now = 0;

  const sandbox = {
    console,
    document: doc,
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn) => { fn(); return 0; },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    performance: { now: () => now },
    navigator: { userAgent: 'simulated-ui-harness' }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  if (options.storage !== undefined) {
    Object.defineProperty(sandbox, 'localStorage', { value: options.storage, configurable: true });
  }
  vm.createContext(sandbox);
  vm.runInContext(coreSrc, sandbox, { filename: 'felt-siege-core.js' });
  vm.runInContext(uiSrc, sandbox, { filename: 'felt-siege-ui.js' });

  const FeltSiege = sandbox.FeltSiege;
  if (!FeltSiege) throw new Error('FeltSiege did not initialise');

  const api = {
    sandbox,
    doc,
    FeltSiege,
    world: FeltSiege.getWorld(),
    frame(dtMs) {
      now += dtMs === undefined ? 16.667 : dtMs;
      const queued = rafQueue.splice(0);
      for (const fn of queued) fn(now);
    },
    frames(count, dtMs) {
      for (let i = 0; i < count; i++) api.frame(dtMs);
    },
    framesUntil(predicate, maxFrames) {
      const limit = maxFrames || 4000;
      for (let i = 0; i < limit; i++) {
        api.frame();
        if (predicate()) return true;
      }
      return false;
    },
    el(id) {
      return doc.getElementById(id);
    },
    click(id) {
      api.el(id).dispatchEvent({ type: 'click' });
    },
    setSlider(id, value) {
      const el = api.el(id);
      el.value = String(value);
      el.dispatchEvent({ type: 'input' });
    },
    key(key, shift) {
      api.el('game-canvas').dispatchEvent({
        type: 'keydown', key, shiftKey: !!shift
      });
    },
    pointer(type, pointerId, x, y) {
      api.el('game-canvas').dispatchEvent({
        type, pointerId, clientX: x, clientY: y
      });
    }
  };
  return api;
}

function playToWin(api) {
  api.setSlider('angle-slider', 10);
  api.setSlider('power-slider', 80);
  api.click('launch-btn');
  return api.framesUntil(() =>
    api.FeltSiege.snapshot().state === 'WON' && api.el('result-dialog').open
  );
}

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS ' + name);
  } catch (e) {
    failed++;
    failures.push(name + ': ' + (e && e.message));
    console.log('FAIL ' + name + ' — ' + (e && e.message));
  }
}

check('startup, score display and locked options', () => {
  const api = boot({ storage: memoryStorage() });
  assert(api.el('shot-count').textContent === '3', 'shots display wrong: ' + api.el('shot-count').textContent);
  assert(api.el('score-value').textContent === '0', 'score display wrong');
  assert(api.el('best-value').textContent === '0', 'best display wrong');
  assert(api.el('status-text').textContent === 'Ready to aim.', 'status wrong: ' + api.el('status-text').textContent);
  const options = api.el('level-select').children;
  assert(options.length === 3, 'level select should list three levels');
  assert(!options[0].disabled, 'first level should be unlocked');
  assert(options[1].disabled && options[2].disabled, 'later levels should start locked');
  assert(api.FeltSiege.snapshot().savingAvailable === true, 'saving should be available');
});

check('button launch, win dialog, focus, next level and score reset', () => {
  const api = boot({ storage: memoryStorage() });
  assert(playToWin(api), 'shot did not win (state ' + api.FeltSiege.snapshot().state + ')');
  const snap = api.FeltSiege.snapshot();
  assert(snap.score > 0, 'win produced no score');
  assert(api.el('result-dialog').open, 'result dialog not shown');
  assert(api.doc.focusLog.indexOf('result-next') >= 0, 'next-level button not focused');
  assert(api.el('result-title').textContent === 'Castle taken!', 'win title wrong');
  const storageState = JSON.parse(api.el.bind ? '{}' : '{}');
  const store = api.sandbox.localStorage.store;
  const saved = JSON.parse(store['feltCastleProgress.v2']);
  assert(saved.unlocked === 1, 'win did not unlock level 2 in storage');
  assert(saved.bests[0] === snap.score, 'best score not persisted');
  api.click('result-next');
  const after = api.FeltSiege.snapshot();
  assert(after.level === 1, 'next level not loaded');
  assert(after.score === 0 && after.shots === 3, 'attempt state not reset for next level');
  assert(!api.el('result-dialog').open, 'dialog not closed on next level');
  assert(api.el('level-select').children[1].disabled === false, 'level 2 still locked in selector');
});

check('pause freezes the simulation and disables firing', () => {
  const api = boot({ storage: memoryStorage() });
  api.click('pause-btn');
  assert(api.FeltSiege.snapshot().paused === true, 'pause flag not set');
  assert(api.el('launch-btn').disabled === true, 'launch not disabled while paused');
  const before = api.FeltSiege.snapshot().simTime;
  api.frames(30);
  assert(api.FeltSiege.snapshot().simTime === before, 'simulation advanced while paused');
  api.key(' ');
  assert(api.FeltSiege.snapshot().state === 'READY', 'keyboard launch worked while paused');
  assert(api.FeltSiege.snapshot().shots === 3, 'ammunition spent while paused');
  api.click('pause-btn');
  api.frames(30);
  assert(api.FeltSiege.snapshot().simTime > before, 'simulation did not resume');
});

check('pointer cancellation and second pointer never fire', () => {
  const api = boot({ storage: memoryStorage() });
  api.pointer('pointerdown', 1, 180, 400);
  assert(api.FeltSiege.snapshot().dragActive === true, 'drag did not begin');
  assert(api.FeltSiege.snapshot().dragPointer === 1, 'pointer not owned');
  api.pointer('pointerdown', 2, 150, 430);
  assert(api.FeltSiege.snapshot().dragPointer === 1, 'second pointer stole ownership');
  api.pointer('pointercancel', 1, 0, 0);
  assert(api.FeltSiege.snapshot().dragActive === false, 'cancel did not clear the drag');
  api.pointer('pointerup', 1, 150, 430);
  assert(api.FeltSiege.snapshot().state === 'READY', 'cancelled drag fired a launch');
  assert(api.FeltSiege.snapshot().shots === 3, 'ammunition spent after cancel');
});

check('pointer release launches exactly once', () => {
  const api = boot({ storage: memoryStorage() });
  api.pointer('pointerdown', 7, 180, 400);
  api.pointer('pointermove', 7, 90, 430);
  api.pointer('pointerup', 7, 90, 430);
  const snap = api.FeltSiege.snapshot();
  assert(snap.state === 'FLYING', 'release did not launch (state ' + snap.state + ')');
  assert(snap.shots === 2, 'release spent the wrong amount of ammunition');
  api.pointer('pointerup', 7, 90, 430);
  api.pointer('pointerdown', 8, 180, 400);
  api.pointer('pointerup', 8, 120, 420);
  assert(api.FeltSiege.snapshot().shots === 2, 'a second launch happened during flight');
  const captures = api.doc.captureLog.filter((e) => e[0] === 'capture');
  assert(captures.length === 1, 'pointer capture not taken exactly once: ' + captures.length);
});

check('visibility loss pauses and cancels a drag', () => {
  const api = boot({ storage: memoryStorage() });
  api.pointer('pointerdown', 3, 180, 400);
  api.pointer('pointermove', 3, 120, 420);
  assert(api.FeltSiege.snapshot().dragActive === true, 'drag did not begin');
  const before = api.FeltSiege.snapshot().simTime;
  api.doc.hidden = true;
  api.doc.dispatchEvent({ type: 'visibilitychange' });
  const snap = api.FeltSiege.snapshot();
  assert(snap.paused === true, 'visibility loss did not pause');
  assert(snap.dragActive === false, 'visibility loss did not cancel the drag');
  api.frames(30);
  assert(api.FeltSiege.snapshot().simTime === before, 'simulation advanced while hidden');
  api.pointer('pointerup', 3, 120, 420);
  assert(api.FeltSiege.snapshot().shots === 3, 'hidden page launched a shot');
});

check('saving failure does not interrupt the result dialog', () => {
  const api = boot({ storage: failingStorage() });
  assert(api.FeltSiege.snapshot().savingAvailable === false, 'saving should report unavailable');
  assert(api.el('save-status').textContent.indexOf('unavailable') >= 0,
    'save status does not mention unavailability: ' + api.el('save-status').textContent);
  assert(playToWin(api), 'shot did not win');
  assert(api.el('result-dialog').open, 'win dialog was interrupted by storage failure');
  assert(api.el('result-title').textContent === 'Castle taken!', 'win flow broken');
  const snap = api.FeltSiege.snapshot();
  assert(snap.score > 0, 'score missing');
  assert(api.FeltSiege.snapshot().savingAvailable === false, 'availability flag flipped');
});

check('keyboard aiming and inspector updates', () => {
  const api = boot({ storage: memoryStorage() });
  api.key('ArrowUp');
  assert(api.FeltSiege.snapshot().angle === 36, 'ArrowUp did not raise angle');
  assert(api.el('angle-slider').value === '36', 'angle slider not synced');
  api.key('ArrowRight', true);
  assert(api.FeltSiege.snapshot().power === 85, 'shift ArrowRight did not raise power by 5');
  assert(api.el('power-value').textContent === '85%', 'power label not synced');
  api.click('inspector-toggle');
  assert(api.FeltSiege.snapshot().inspectorOpen === true, 'inspector did not open');
  assert(api.el('inspector-panel').hidden === false, 'inspector panel still hidden');
  const listing = api.el('inspector-components').innerHTML;
  assert(listing.indexOf('DragBlock') >= 0 && listing.indexOf('GameHUD') >= 0,
    'component list incomplete');
  api.frames(16);
  const telemetry = api.el('inspector-body').innerHTML;
  assert(telemetry.indexOf('READY') >= 0, 'inspector telemetry missing state');
  api.key(' ');
  assert(api.FeltSiege.snapshot().state === 'FLYING', 'space did not launch');
  api.key('p');
  assert(api.FeltSiege.snapshot().paused === true, 'P did not pause');
  api.key('p');
  assert(api.FeltSiege.snapshot().paused === false, 'P did not resume');
  api.key('Escape');
  assert(api.FeltSiege.snapshot().dragActive === false, 'escape left a drag active');
});

console.log('');
console.log(passed + ' simulated UI checks passed, ' + failed + ' failed.');
if (failures.length) {
  console.log('Failures:');
  for (const f of failures) console.log('  - ' + f);
}
process.exit(failed ? 1 : 0);
