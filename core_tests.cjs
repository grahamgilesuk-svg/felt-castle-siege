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

const sandbox = { console };
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(extractScript('felt-siege-core'), sandbox, { filename: 'felt-siege-core.js' });

const Core = sandbox.FeltSiegeCore;
if (!Core) {
  console.error('FeltSiegeCore did not initialise');
  process.exit(1);
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

function freshWorld(level) {
  const world = new Core.SiegeWorld();
  world.reset(level === undefined ? 0 : level);
  return world;
}

function advance(world, seconds, frameDt) {
  const dt = frameDt || 1 / 60;
  let elapsed = 0;
  while (elapsed < seconds - 1e-9) {
    const step = Math.min(dt, seconds - elapsed);
    world.step(step);
    elapsed += step;
  }
}

function advanceUntil(world, seconds, predicate) {
  let elapsed = 0;
  while (elapsed < seconds) {
    world.step(1 / 60);
    elapsed += 1 / 60;
    if (predicate()) return true;
  }
  return false;
}

function launchAim(world, angle, power) {
  return world.launch(Core.pullFromAim(angle, power));
}

function playToWin(world, angle, power) {
  if (!launchAim(world, angle, power)) return false;
  return advanceUntil(world, 15, () => world.state === 'WON');
}

function drainTypes(world) {
  return world.drain().map((e) => e.type);
}

function positions(world) {
  return world.bodies.filter((b) => b.alive).map((b) => ({ id: b.id, x: b.x, y: b.y }));
}

function samePositions(a, b, epsilon) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    if (Math.abs(a[i].x - b[i].x) > epsilon) return false;
    if (Math.abs(a[i].y - b[i].y) > epsilon) return false;
  }
  return true;
}

function makeBox(id, x, y, hw, hh, mass) {
  return {
    id, x, y, hw, hh,
    vx: 0, vy: 0,
    mass, invMass: 1 / mass,
    alive: true, isProjectile: false, radius: 0, grounded: false
  };
}

const STABILITY_SECONDS = 30;
for (let level = 0; level < Core.Levels.length; level++) {
  check('stability: ' + Core.Levels[level].name + ' idle ' + STABILITY_SECONDS + 's', () => {
    const world = freshWorld(level);
    const before = positions(world);
    advance(world, STABILITY_SECONDS);
    const after = positions(world);
    assert(samePositions(before, after, 0.5),
      'layout moved while idle: ' + JSON.stringify({ before, after }));
  });
}

for (let level = 0; level < Core.Levels.length; level++) {
  check('playability: ' + Core.Levels[level].name + ' wins at 10deg/80%', () => {
    const world = freshWorld(level);
    assert(playToWin(world, 10, 80), 'level did not reach WON within 15 s (state ' + world.state + ')');
  });
}

check('explosion chain: grand fortress produces two explosions', () => {
  const world = freshWorld(2);
  assert(playToWin(world, 10, 80), 'level 3 did not reach WON (state ' + world.state + ')');
  assert(world.explosionCount >= 2, 'expected two explosions, saw ' + world.explosionCount);
});

check('round handling: three misses lose the attempt', () => {
  const world = freshWorld(0);
  for (let shot = 0; shot < 3; shot++) {
    assert(launchAim(world, 80, 20), 'miss ' + (shot + 1) + ' was rejected');
    assert(advanceUntil(world, 14, () => world.state !== 'FLYING'),
      'shot ' + (shot + 1) + ' never resolved');
    if (shot < 2) assert(world.state === 'READY', 'expected READY between misses, saw ' + world.state);
  }
  assert(world.state === 'LOST', 'expected LOST after three misses, saw ' + world.state);
});

check('round handling: win freezes simulation and score', () => {
  const world = freshWorld(0);
  assert(playToWin(world, 10, 80), 'did not win');
  const score = world.score;
  const frozen = positions(world);
  advance(world, 3);
  assert(world.state === 'WON', 'state changed after win');
  assert(world.score === score, 'score changed after win');
  assert(samePositions(frozen, positions(world), 0.001), 'bodies moved after win');
});

check('round handling: loss freezes simulation', () => {
  const world = freshWorld(0);
  for (let shot = 0; shot < 3; shot++) {
    launchAim(world, 80, 20);
    advanceUntil(world, 14, () => world.state !== 'FLYING');
  }
  assert(world.state === 'LOST', 'expected LOST');
  const score = world.score;
  const frozen = positions(world);
  advance(world, 3);
  assert(world.state === 'LOST' && world.score === score, 'state mutated after loss');
  assert(samePositions(frozen, positions(world), 0.001), 'bodies moved after loss');
});

check('round handling: reset clears attempt state', () => {
  const world = freshWorld(0);
  assert(playToWin(world, 10, 80), 'did not win');
  assert(world.score > 0, 'expected points before reset');
  world.drain();
  world.reset(0);
  assert(world.score === 0, 'score survived reset');
  assert(world.shots === 3, 'shots not restored');
  assert(world.state === 'READY', 'state not READY after reset');
  assert(world.crown.alive, 'crown not restored');
  assert(world.crownScored === false, 'crown scoring flag survived reset');
  world.drain();
  assert(world.drain().length === 0, 'events survived reset');
});

check('round handling: only one active shot', () => {
  const world = freshWorld(0);
  assert(launchAim(world, 10, 80), 'first launch rejected');
  assert(!launchAim(world, 10, 80), 'second launch accepted while flying');
  assert(world.shots === 2, 'ammunition spent incorrectly');
});

check('round handling: invalid and tiny pulls spend no ammunition', () => {
  const world = freshWorld(0);
  assert(!world.launch(null), 'null pull accepted');
  assert(!world.launch({ x: 5, y: 0 }), 'tiny pull accepted');
  assert(!world.launch({ x: NaN, y: 20 }), 'NaN pull accepted');
  assert(world.shots === 3, 'ammunition spent on invalid pulls');
  assert(world.state === 'READY', 'state changed on invalid pulls');
});

check('prediction: matches free-flight integration sample for sample', () => {
  const predictor = new Core.TrajectoryPredictorBlock();
  const pull = Core.pullFromAim(35, 80);
  const points = predictor.predict(pull, 200);
  assert(points.length > 10, 'prediction produced too few points');
  const cfg = Core.Defaults;
  const dt = cfg.fixedDt;
  let x = Core.Sling.x + pull.x;
  let y = Core.Sling.y + pull.y;
  let vx = -pull.x * cfg.pullVelocity;
  let vy = -pull.y * cfg.pullVelocity;
  for (let i = 0; i < points.length; i++) {
    vy += cfg.gravity * dt;
    x += vx * dt;
    y += vy * dt;
    assert(Math.abs(points[i].x - x) < 1e-9 && Math.abs(points[i].y - y) < 1e-9,
      'sample ' + i + ' diverges from manual integration');
  }
  const world = freshWorld(0);
  assert(world.launch(pull), 'launch rejected');
  assert(Math.abs(world.projectile.x - (Core.Sling.x + pull.x)) < 1e-9 &&
    Math.abs(world.projectile.y - (Core.Sling.y + pull.y)) < 1e-9,
    'shot start differs from prediction start');
});

check('timing: 30/60/144 Hz driving yields identical state', () => {
  const results = [];
  const TARGET_STEPS = 60;
  for (const frameDt of [1 / 30, 1 / 60, 1 / 144]) {
    const world = freshWorld(0);
    launchAim(world, 10, 80);
    let guard = 0;
    while (world.clock.stepsRun < TARGET_STEPS && guard++ < 10000) {
      world.step(frameDt);
    }
    assert(world.clock.stepsRun === TARGET_STEPS, 'fixed-step count not reached');
    results.push({
      x: world.projectile.x,
      y: world.projectile.y,
      castle: world.bodies.find((b) => b.id === 'post-left'),
      state: world.state
    });
  }
  const base = results[0];
  for (let i = 1; i < results.length; i++) {
    assert(results[i].state === base.state, 'state diverged across frame rates');
    assert(Math.abs(results[i].x - base.x) < 0.5 && Math.abs(results[i].y - base.y) < 0.5,
      'projectile position diverged across frame rates');
    assert(Math.abs(results[i].castle.x - base.castle.x) < 0.5 &&
      Math.abs(results[i].castle.y - base.castle.y) < 0.5,
      'castle position diverged across frame rates');
  }
});

check('timing: long frames are bounded', () => {
  const clock = new Core.FixedStepClockBlock(1 / 120, 0.1);
  let steps = 0;
  clock.advance(5, () => { steps++; });
  assert(steps <= 13, 'long frame ran ' + steps + ' steps, expected at most 13');
  assert(clock.accumulator < 1, 'accumulator not bounded: ' + clock.accumulator);
});

check('input core: pull is clamped to maximum', () => {
  const drag = new Core.DragBlock();
  const pull = drag.begin(1, Core.Sling.x - 500, Core.Sling.y);
  assert(pull, 'begin returned null');
  assert(Math.abs(Math.hypot(pull.x, pull.y) - Core.Defaults.maxPull) < 1e-9,
    'pull magnitude ' + Math.hypot(pull.x, pull.y) + ' exceeds maximum');
});

check('input core: pointer ownership is exclusive', () => {
  const drag = new Core.DragBlock();
  assert(drag.begin(1, Core.Sling.x - 100, Core.Sling.y), 'first begin rejected');
  assert(drag.begin(2, Core.Sling.x - 100, Core.Sling.y) === null, 'second pointer accepted');
  assert(drag.move(2, Core.Sling.x - 50, Core.Sling.y) === null, 'foreign pointer move accepted');
  assert(drag.end(2) === null, 'foreign pointer end accepted');
  assert(drag.isActive() && drag.pointerId === 1, 'ownership changed');
});

check('input core: cancellation and tiny pulls never fire', () => {
  const drag = new Core.DragBlock();
  drag.begin(1, Core.Sling.x - 100, Core.Sling.y);
  drag.cancel();
  assert(drag.end(1) === null, 'end after cancel returned a pull');
  assert(drag.begin(1, Core.Sling.x - 5, Core.Sling.y), 're-begin after cancel rejected');
  assert(drag.end(1) === null, 'tiny pull returned a launch vector');
  drag.begin(1, Core.Sling.x - 60, Core.Sling.y + 10);
  const pull = drag.end(1);
  assert(pull && Math.hypot(pull.x, pull.y) > Core.Defaults.minPull, 'valid pull lost');
});

check('physics: impulse transfer is mass-dependent', () => {
  const collision = new Core.CollisionBlock();
  function hitWith(moverMass) {
    const mover = makeBox('mover', 0, 0, 10, 10, moverMass);
    mover.vx = 200;
    const target = makeBox('target', 19, 0, 10, 10, 1);
    const contact = collision.contact(mover, target);
    assert(contact, 'contact not found');
    collision.resolve(mover, target, contact);
    return target.vx;
  }
  const light = hitWith(1);
  const heavy = hitWith(11);
  assert(heavy > light + 20,
    'expected heavier mover to transfer more velocity: light ' + light + ', heavy ' + heavy);
});

check('physics: embedded circle yields a valid separating normal', () => {
  const collision = new Core.CollisionBlock();
  const circle = makeBox('circle', 500, 300, 18, 18, 5);
  circle.isProjectile = true;
  circle.radius = 18;
  const box = makeBox('box', 500, 300, 30, 30, 11);
  let contact = collision.contact(circle, box);
  assert(contact, 'embedded circle produced no contact');
  const normalLength = Math.hypot(contact.nx, contact.ny);
  assert(Math.abs(normalLength - 1) < 1e-9, 'normal not unit length');
  assert(contact.pen > 0, 'penetration not positive');
  for (let i = 0; i < Core.Defaults.solverIterations; i++) {
    contact = collision.contact(circle, box);
    if (!contact) break;
    collision.resolve(circle, box, contact);
  }
  const after = collision.contact(circle, box);
  assert(!after || after.pen < 1,
    'bodies still deeply embedded after resolve (pen ' + (after && after.pen) + ')');
});

check('objectives: displaced crown wins only after a launch', () => {
  const world = freshWorld(0);
  world.crown.x += 100;
  advance(world, 1);
  assert(world.state === 'READY', 'crown displacement won before any launch');
  assert(launchAim(world, 80, 20), 'launch rejected');
  world.crown.x += 50;
  assert(advanceUntil(world, 2, () => world.state === 'WON'), 'displaced crown did not win');
});

check('objectives: each barrel detonates exactly once', () => {
  const world = freshWorld(1);
  world.drain();
  assert(world.damageBody('barrel', 999), 'barrel damage rejected');
  assert(!world.damageBody('barrel', 999), 'dead barrel took damage again');
  const events = world.drain();
  const explosions = events.filter((e) => e.type === 'explode');
  const destroyed = events.filter((e) => e.type === 'destroy' && e.id === 'barrel');
  assert(explosions.length === 1, 'barrel exploded ' + explosions.length + ' times');
  assert(destroyed.length === 1, 'barrel destroyed ' + destroyed.length + ' times');
});

check('recovery: boulder leaving on the left resolves the shot', () => {
  const world = freshWorld(0);
  assert(world.launch({ x: 60, y: 0 }), 'leftward launch rejected');
  assert(advanceUntil(world, 5, () => world.state === 'READY'),
    'shot never resolved after left exit (state ' + world.state + ')');
  assert(world.shots === 2, 'ammunition not spent exactly once');
});

check('recovery: twelve-second timeout returns control', () => {
  const world = freshWorld(0);
  assert(launchAim(world, 45, 50), 'launch rejected');
  advance(world, 13);
  assert(world.state !== 'FLYING', 'shot still flying after 13 s');
});

check('persistence: malformed, denied, bests and legacy migration', () => {
  const memory = () => {
    const store = Object.create(null);
    return {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      store
    };
  };

  const malformed = new Core.SessionStorageBlock(memory(), 3);
  malformed.adapter.setItem(malformed.key, '{not json');
  let result = malformed.load();
  assert(result.state.unlocked === 0 && result.state.bests[0] === 0, 'malformed JSON not defaulted');

  const wrongShape = new Core.SessionStorageBlock(memory(), 3);
  wrongShape.adapter.setItem(wrongShape.key, JSON.stringify({
    version: 2, unlocked: -7, selected: 99, bests: [-5, 'x', 1e9], muted: 0
  }));
  result = wrongShape.load();
  assert(result.state.unlocked === 0, 'negative unlock not clamped');
  assert(result.state.selected === 0, 'selected exceeded unlocked');
  assert(result.state.bests[2] === Core.Defaults.scoreCap, 'score cap not applied');

  const denied = new Core.SessionStorageBlock({
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); }
  }, 3);
  result = denied.load();
  assert(result.state.unlocked === 0, 'denied storage broke load');
  assert(denied.save(denied.defaults()) === false, 'save on denied storage reported success');
  let threw = false;
  try { denied.complete(0, 500); } catch (e) { threw = true; }
  assert(!threw, 'complete threw on denied storage');

  const persistent = new Core.SessionStorageBlock(memory(), 3);
  persistent.complete(0, 500);
  persistent.complete(0, 300);
  result = persistent.load();
  assert(result.state.unlocked === 1, 'win did not unlock next level');
  persistent.complete(1, 100);
  result = persistent.load();
  assert(result.state.unlocked === 2, 'second win did not unlock third level');
  assert(result.state.bests[0] === 500, 'lower replay score replaced best');
  assert(result.state.bests[1] === 100, 'second level best missing');

  const legacyAdapter = memory();
  legacyAdapter.setItem('feltCastleProgress', JSON.stringify({ unlocked: 2, score: 9999 }));
  const legacy = new Core.SessionStorageBlock(legacyAdapter, 3);
  result = legacy.load();
  assert(result.migrated === true, 'legacy record not migrated');
  assert(result.state.unlocked === 2, 'legacy unlock not preserved');
  assert(result.state.bests[0] === 0, 'legacy cumulative score became a best');
  assert(legacyAdapter.store['feltCastleProgress'] !== undefined, 'legacy key was deleted');
});

console.log('');
console.log(passed + ' core checks passed, ' + failed + ' failed.');
if (failures.length) {
  console.log('Failures:');
  for (const f of failures) console.log('  - ' + f);
}
process.exit(failed ? 1 : 0);
