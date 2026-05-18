import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// CONFIG
// ============================================================

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const missing = [
    !SUPABASE_URL && 'SUPABASE_URL',
    !SUPABASE_ANON_KEY && 'SUPABASE_ANON_KEY',
  ].filter(Boolean);
  console.error(`❌ Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEST_EMAIL    = 'test@pawnder.com';
const TEST_PASSWORD = 'testpass123';

// ============================================================
// RESULT TRACKING
// ============================================================

const results = [];

function pass(name, detail = '') {
  results.push({ name, status: 'PASS' });
  console.log(`✅ ${name}${detail ? ': ' + detail : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, status: 'FAIL' });
  console.error(`❌ ${name}${detail ? ': ' + detail : ''}`);
}

// ============================================================
// TESTS
// ============================================================

async function testGetItems() {
  const { data, error } = await supabase.from('items').select('*');
  if (error) return fail('GET /items', error.message);
  if (!Array.isArray(data)) return fail('GET /items', 'response is not an array');
  pass('GET /items', `${data.length} items fetched`);
  return data;
}

async function testGetResults() {
  const { data, error } = await supabase.from('results').select('*');
  if (error) return fail('GET /results (initial)', error.message);
  pass('GET /results (initial)', `accessible (${data.length} vote rows)`);
  return data;
}

async function testVoteWithoutAuth(itemId) {
  // Use a random uuid as user_id — anon session has no uid so this must be rejected by RLS
  const { error } = await supabase
    .from('votes')
    .insert({ user_id: '00000000-0000-0000-0000-000000000001', item_id: itemId, choice: 'yes' });

  if (error) {
    pass('POST /vote without auth', 'correctly blocked by RLS');
  } else {
    fail('POST /vote without auth', 'RLS not working — insert succeeded when it should have been blocked!');
  }
}

async function testSignUp() {
  const { data, error } = await supabase.auth.signUp({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (error && error.message.includes('already registered')) {
    // User exists from a prior run — that's fine
    pass('Auth signup', 'test user already exists');
    return true;
  }
  if (error) return fail('Auth signup', error.message);
  if (!data.user) return fail('Auth signup', 'no user object returned');
  pass('Auth signup', `user created (${data.user.email})`);
  return true;
}

async function testSignIn() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error) {
    fail('Auth sign-in', error.message);
    return null;
  }
  pass('Auth sign-in', `signed in as ${data.user.email}`);
  return data.user;
}

async function testVoteWithAuth(itemId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('POST /vote with auth', 'no authenticated user');

  const { data, error } = await supabase
    .from('votes')
    .insert({ user_id: user.id, item_id: itemId, choice: 'yes' })
    .select()
    .single();

  if (error) return fail('POST /vote with auth', error.message);
  pass('POST /vote with auth', `vote recorded (id: ${data.id})`);
  return data;
}

async function testDuplicateVote(itemId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Duplicate vote blocked', 'no authenticated user');

  const { error } = await supabase
    .from('votes')
    .insert({ user_id: user.id, item_id: itemId, choice: 'no' });

  if (error) {
    pass('Duplicate vote blocked', 'dedup working (unique constraint enforced)');
  } else {
    fail('Duplicate vote blocked', 'dedup not working — second vote was accepted!');
  }
}

async function testResultsAfterVote(itemId) {
  const { data, error } = await supabase
    .from('results')
    .select('*')
    .eq('item_id', itemId)
    .single();

  if (error) return fail('GET /results after vote', error.message);
  if (!data) return fail('GET /results after vote', 'no result row found for item');
  pass(
    'GET /results after vote',
    `yes_count=${data.yes_count} no_count=${data.no_count} total=${data.total_votes}`
  );
}

// ============================================================
// SUMMARY TABLE
// ============================================================

function printSummary() {
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  console.log('\n' + '='.repeat(52));
  console.log(' TEST SUMMARY');
  console.log('='.repeat(52));

  for (const { name, status } of results) {
    const icon = status === 'PASS' ? '✅' : '❌';
    console.log(` ${icon}  ${name}`);
  }

  console.log('='.repeat(52));
  console.log(` ${passed} passed  |  ${failed} failed  |  ${results.length} total`);
  console.log('='.repeat(52));

  if (failed > 0) process.exitCode = 1;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('🚀 Pawnder API Verification\n');

  // Test 1 — public read items
  const items = await testGetItems();
  const firstItemId = items?.[0]?.id;

  // Test 2 — public read results (before any votes)
  await testGetResults();

  if (!firstItemId) {
    fail('POST /vote without auth',   'skipped — no items in DB');
    fail('Auth signup',               'skipped — no items in DB');
    fail('Auth sign-in',              'skipped — no items in DB');
    fail('POST /vote with auth',      'skipped — no items in DB');
    fail('Duplicate vote blocked',    'skipped — no items in DB');
    fail('GET /results after vote',   'skipped — no items in DB');
    return printSummary();
  }

  // Test 3 — unauthenticated insert must be blocked
  await testVoteWithoutAuth(firstItemId);

  // Test 4 — sign up
  const signedUp = await testSignUp();
  if (!signedUp) {
    fail('Auth sign-in',            'skipped — signup failed');
    fail('POST /vote with auth',    'skipped — signup failed');
    fail('Duplicate vote blocked',  'skipped — signup failed');
    fail('GET /results after vote', 'skipped — signup failed');
    return printSummary();
  }

  // Test 5 — sign in (needed even if user already existed)
  const user = await testSignIn();
  if (!user) {
    fail('POST /vote with auth',    'skipped — sign-in failed');
    fail('Duplicate vote blocked',  'skipped — sign-in failed');
    fail('GET /results after vote', 'skipped — sign-in failed');
    return printSummary();
  }

  // Clean up any leftover vote from a prior run so Test 5 is reliable
  await supabase.from('votes').delete().eq('user_id', user.id).eq('item_id', firstItemId);

  // Test 5 — authenticated insert
  await testVoteWithAuth(firstItemId);

  // Test 6 — duplicate vote must be blocked
  await testDuplicateVote(firstItemId);

  // Test 7 — results view reflects the vote
  await testResultsAfterVote(firstItemId);

  // Sign out (clean session)
  await supabase.auth.signOut();

  printSummary();
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
