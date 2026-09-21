const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const database = require('../config/database');
const notificationRepository = require('../repositories/notification.repository');
const notificationService = require('../services/notification.service');
const announcementRepository = require('../repositories/announcement.repository');
const announcementService = require('../services/announcement.service');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const originals = {
  query: database.query,
  findByOwner: notificationRepository.findByOwner,
  countByOwner: notificationRepository.countByOwner,
  countUnread: notificationRepository.countUnread,
  markOneRead: notificationRepository.markOneRead,
  markAllRead: notificationRepository.markAllRead,
  findActiveAnnouncements: announcementRepository.findActiveAnnouncements,
  createAnnouncement: announcementRepository.createAnnouncement
};

test.afterEach(() => {
  database.query = originals.query;
  Object.assign(notificationRepository, {
    findByOwner: originals.findByOwner,
    countByOwner: originals.countByOwner,
    countUnread: originals.countUnread,
    markOneRead: originals.markOneRead,
    markAllRead: originals.markAllRead
  });
  Object.assign(announcementRepository, {
    findActiveAnnouncements: originals.findActiveAnnouncements,
    createAnnouncement: originals.createAnnouncement
  });
});

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

test('every notification query is scoped to one account in SQL, not in JavaScript', () => {
  const source = read('backend/repositories/notification.repository.js');
  // Only the queries actually handed to the driver matter; the shared SELECT
  // fragment is filterless by design because every caller composes onto it.
  const executed = source.match(/(?:database|client)\.query\(`[\s\S]*?`/g) || [];

  assert.ok(executed.length >= 5, 'the repository runs several notification queries');
  let scoped = 0;
  for (const statement of executed) {
    if (!/notifications/.test(statement)) continue;
    // The insert names the owner as a column; every read and update filters on it.
    assert.match(statement, /user_id/, statement.slice(0, 80));
    if (/user_id = \$\d/.test(statement)) scoped += 1;
  }
  assert.ok(scoped >= 4, 'reads and updates all filter by user_id');

  // Ownership is never taken from the request body.
  const service = read('backend/services/notification.service.js');
  assert.match(service, /user\.userId/);
  assert.doesNotMatch(service, /body\.userId|input\.userId/);
});

test('reading another account notification reports it as missing, not forbidden', async () => {
  notificationRepository.markOneRead = async () => ({ updated: false, exists: false });
  notificationRepository.countUnread = async () => 0;

  await assert.rejects(
    notificationService.markRead({ userId: 5, role: 'USER' }, '9'),
    (error) => error.statusCode === 404 && error.message === 'Notification not found'
  );

  // An already-read notification the caller does own is not an error.
  notificationRepository.markOneRead = async () => ({ updated: false, exists: true });
  const result = await notificationService.markRead({ userId: 5, role: 'USER' }, '9');
  assert.equal(result.isRead, true);
});

test('the mark-read update carries the owner, so a wrong owner changes no row', () => {
  const source = read('backend/repositories/notification.repository.js');
  assert.match(
    source,
    /UPDATE notifications SET read_at = CURRENT_TIMESTAMP\s*\n\s*WHERE notification_id = \$1 AND user_id = \$2/
  );
  assert.match(
    source,
    /UPDATE notifications SET read_at = CURRENT_TIMESTAMP\s*\n\s*WHERE user_id = \$1 AND read_at IS NULL/
  );
});

test('an invalid notification identifier is refused before any query', async () => {
  let queries = 0;
  notificationRepository.markOneRead = async () => { queries += 1; return { updated: true }; };

  for (const value of ['abc', '-1', '1.5', '', '1; DROP TABLE notifications']) {
    await assert.rejects(
      notificationService.markRead({ userId: 5, role: 'USER' }, value),
      (error) => error.statusCode === 400
    );
  }
  assert.equal(queries, 0);
});

// ---------------------------------------------------------------------------
// Listing, counting and links
// ---------------------------------------------------------------------------

test('the list carries an unread count and paginates with clamped input', async () => {
  let captured;
  notificationRepository.findByOwner = async (userId, options) => {
    captured = { userId, options };
    return [{
      notificationId: 1, notificationType: 'APPLICATION_STATUS', title: 'Updated',
      message: 'Your application is now SHORTLISTED.', relatedEntityType: 'APPLICATION',
      relatedEntityId: 3, readAt: null, createdAt: new Date()
    }];
  };
  notificationRepository.countByOwner = async () => 1;
  notificationRepository.countUnread = async () => 4;

  const result = await notificationService.listOwnNotifications(
    { userId: 5, role: 'USER' },
    { page: '999999', pageSize: '5000' }
  );

  assert.equal(captured.userId, 5);
  assert.equal(captured.options.limit, 50, 'page size is clamped to the maximum');
  assert.equal(result.unreadCount, 4);
  assert.equal(result.items[0].isRead, false);
  assert.equal(result.pagination.pageSize, 50);
});

test('a related entity becomes a fixed internal page name, never a stored URL', async () => {
  notificationRepository.countByOwner = async () => 1;
  notificationRepository.countUnread = async () => 0;

  const linkFor = async (relatedEntityType, role) => {
    notificationRepository.findByOwner = async () => [{
      notificationId: 1, notificationType: 'APPLICATION_STATUS', title: 'T', message: 'M',
      relatedEntityType, relatedEntityId: 3, readAt: null, createdAt: new Date()
    }];
    const result = await notificationService.listOwnNotifications({ userId: 5, role }, {});
    return result.items[0].link;
  };

  assert.equal(await linkFor('APPLICATION', 'USER'), 'my-applications.html');
  assert.equal(await linkFor('VERIFICATION', 'USER'), 'employee-verification.html');
  // The same entity points a representative at their own workspace instead.
  assert.equal(await linkFor('APPLICATION', 'COMPANY_REPRESENTATIVE'), 'representative.html');
  // An unknown or absent entity yields no link at all.
  assert.equal(await linkFor('SOMETHING_ELSE', 'USER'), null);
  assert.equal(await linkFor(null, 'USER'), null);

  for (const link of Object.values(notificationService.ENTITY_LINKS)) {
    assert.match(link, /^[a-z-]+\.html$/, link);
  }
});

test('mark-all-read reports the new unread count as zero', async () => {
  notificationRepository.markAllRead = async () => ({ updatedCount: 7 });
  const result = await notificationService.markAllRead({ userId: 5, role: 'USER' });
  assert.deepEqual(result, { updatedCount: 7, unreadCount: 0 });
});

// ---------------------------------------------------------------------------
// Notification content safety
// ---------------------------------------------------------------------------

test('notification text can never carry markup, passwords, tokens or admin notes', () => {
  const schema = read('database/postgres/01_final_schema_postgres.sql');
  const migration = read('database/postgres/migrations/003_announcements_and_notifications.sql');

  // The database refuses angle brackets in both tables.
  for (const source of [schema, migration]) {
    assert.match(source, /ck_notifications_plain_text CHECK \(\s*title !~ '\[<>\]' AND message !~ '\[<>\]'/);
    assert.match(source, /ck_announcements_plain_text CHECK \(\s*title !~ '\[<>\]' AND message !~ '\[<>\]'/);
  }

  // No repository builds a notification message from a secret or an internal
  // moderation note. The moderation note in particular stays internal.
  const admin = read('backend/repositories/admin.repository.js');
  const notificationCall = admin.slice(admin.indexOf('insertNotification(client'), admin.indexOf('await client.query(\'COMMIT\')'));
  assert.doesNotMatch(notificationCall, /actionNote|action_note/);

  for (const file of [
    'backend/repositories/notification.repository.js',
    'backend/repositories/representative.repository.js',
    'backend/repositories/application.repository.js',
    'backend/repositories/job.repository.js'
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /password_hash|token_hash|rawToken/, file);
  }
});

test('the browser never stores notifications in the public offline cache', () => {
  const offline = read('frontend/js/offline-cache.js');
  const worker = read('frontend/sw.js');

  // Run the real allow-list rather than reading around its comments.
  const context = {
    URL, Date,
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { querySelector: () => null, querySelectorAll: () => [] }
  };
  vm.createContext(context);
  vm.runInContext(offline.replaceAll('export ', ''), context);

  for (const privatePath of [
    '/api/me/notifications',
    '/api/me/notifications/unread-count',
    '/api/me/applications',
    '/api/me/representative-assignments',
    '/api/representative/verifications',
    '/api/admin/reports',
    '/api/assistant/messages',
    '/api/auth/me'
  ]) {
    assert.equal(context.isCacheable(privatePath), false, privatePath);
  }
  // The public endpoints the homepage and job board need are still cacheable.
  for (const publicPath of ['/api/jobs', '/api/announcements', '/api/stats/overview']) {
    assert.equal(context.isCacheable(publicPath), true, publicPath);
  }
  assert.match(worker, /'js\/notifications\.js'/);
  // notifications.js appears only in the purge list, never in the cached shell.
  const assets = worker.slice(worker.indexOf('const ASSETS'), worker.indexOf('const allowed'));
  assert.equal(assets.includes('notifications.js'), false);

  // Every notification request is authenticated, which the cache refuses.
  const client = read('frontend/js/notifications.js');
  const requests = client.match(/apiRequest\([^)]*\)/gs) || [];
  assert.ok(requests.length >= 3);
  for (const request of requests) assert.match(request, /auth: true/, request);
});

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

test('only announcements inside their schedule are public, and SQL decides that', () => {
  const source = read('backend/repositories/announcement.repository.js');
  const publicQuery = source.slice(source.indexOf('findActiveAnnouncements'), source.indexOf('findAllAnnouncements'));

  assert.match(publicQuery, /is_active = TRUE/);
  assert.match(publicQuery, /starts_at <= CURRENT_TIMESTAMP/);
  assert.match(publicQuery, /ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP/);
  // The public shape omits the author and the internal timestamps.
  assert.doesNotMatch(publicQuery, /created_by/);
});

test('announcement text is rejected before it reaches the database', async () => {
  let writes = 0;
  announcementRepository.createAnnouncement = async () => { writes += 1; return { announcementId: 1 }; };

  const valid = {
    title: 'Scheduled maintenance',
    message: 'Saple will be briefly unavailable on Saturday morning.'
  };

  await announcementService.createAnnouncement(6, valid);
  assert.equal(writes, 1);

  const invalid = [
    [{ ...valid, title: '<script>alert(1)</script>' }, /plain text without angle brackets/],
    [{ ...valid, message: 'Visit <a href="#">here</a> for details right now.' }, /plain text without angle brackets/],
    [{ ...valid, title: 'no' }, /Title must be between/],
    [{ ...valid, message: 'short' }, /Message must be between/],
    [{ ...valid, severity: 'CATASTROPHIC' }, /Severity must be one of/],
    [{ ...valid, startsAt: '2026-01-02T00:00:00Z', endsAt: '2026-01-01T00:00:00Z' }, /end time must be after/]
  ];

  for (const [input, pattern] of invalid) {
    await assert.rejects(
      announcementService.createAnnouncement(6, input),
      (error) => error.statusCode === 400 && pattern.test(error.message),
      JSON.stringify(input).slice(0, 60)
    );
  }
  assert.equal(writes, 1, 'no invalid announcement reached the repository');
});

test('the announcement bar renders text, remembers dismissals per version, and never blocks a page', () => {
  const source = read('frontend/js/announcements.js');

  assert.match(source, /textContent|text:/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  // A dismissal is keyed by id and version, so an edited notice reappears once.
  assert.match(source, /\$\{announcement\.announcementId\}:\$\{announcement\.updatedAt/);
  // A non-dismissible announcement cannot be dismissed away.
  assert.match(source, /if \(announcement\.isDismissible\)/);
  // A failure here must never interrupt the page the reader asked for.
  assert.match(source, /catch \(error\) \{[\s\S]*?return;\s*\}/);
  // Storage is optional: a blocked localStorage must not throw.
  assert.match(source, /try \{[\s\S]*?localStorage/);
});
