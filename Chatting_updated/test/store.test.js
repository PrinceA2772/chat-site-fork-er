const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// DATA_DIR must be set before requiring the store, because paths are resolved
// once at module load. This keeps tests off the real data/db.json.
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ptr29-store-'));
process.env.DATA_DIR = DATA_DIR;

const store = require('../data/store');

test.after(() => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test('uses DATA_DIR instead of the bundled data folder', () => {
  assert.strictEqual(store.DB_DIR, path.resolve(DATA_DIR));
  assert.strictEqual(store.DB_PATH, path.join(path.resolve(DATA_DIR), 'db.json'));
});

test('creates a fresh database seeded with the general room', () => {
  const rooms = store.getRoomNames();
  assert.ok(rooms.includes('general'));
  assert.ok(fs.existsSync(store.DB_PATH));
});

test('persists messages across reads', () => {
  store.ensureRoom('unit-room');
  store.addMessage('unit-room', { id: 'm1', text: 'hello' });
  store.addMessage('unit-room', { id: 'm2', text: 'world' });

  const messages = store.getMessages('unit-room');
  assert.strictEqual(messages.length, 2);
  assert.strictEqual(messages[1].text, 'world');
});

test('writes atomically and leaves no temp files behind', () => {
  store.addMessage('unit-room', { id: 'm3', text: 'atomic' });

  const leftovers = fs.readdirSync(path.resolve(DATA_DIR)).filter((f) => f.endsWith('.tmp'));
  assert.deepStrictEqual(leftovers, []);

  // The on-disk file must always be valid JSON after a write.
  const raw = fs.readFileSync(store.DB_PATH, 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw));
});

test('recovers from a corrupt database file', () => {
  fs.writeFileSync(store.DB_PATH, '{ not json');

  const rooms = store.getRoomNames();
  assert.deepStrictEqual(rooms, ['general']);

  const raw = fs.readFileSync(store.DB_PATH, 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw));
});
