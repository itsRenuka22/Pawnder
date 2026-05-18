import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import readline from 'readline';

// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================

console.log('🔍 Validating environment variables...');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, UNSPLASH_ACCESS_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !UNSPLASH_ACCESS_KEY) {
  const missing = [
    !SUPABASE_URL && 'SUPABASE_URL',
    !SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
    !UNSPLASH_ACCESS_KEY && 'UNSPLASH_ACCESS_KEY',
  ].filter(Boolean);
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  console.error('   Copy .env.example to .env and fill in your credentials.');
  process.exit(1);
}

console.log('✅ All credentials loaded');

// ============================================================
// SUPABASE CLIENT (service role bypasses RLS for seeding)
// ============================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================
// SEED DATA
// ============================================================

const SPECIES_DATA = {
  dog: {
    names:  ['Max', 'Bella', 'Charlie', 'Luna', 'Cooper', 'Daisy', 'Rocky', 'Sadie', 'Duke', 'Molly'],
    breeds: ['Golden Retriever', 'Labrador', 'Beagle', 'Poodle', 'Bulldog', 'German Shepherd', 'Corgi', 'Husky'],
  },
  cat: {
    names:  ['Whiskers', 'Shadow', 'Mittens', 'Tiger', 'Oliver', 'Luna', 'Simba', 'Cleo', 'Smokey', 'Nala'],
    breeds: ['Tabby', 'Siamese', 'Persian', 'Maine Coon', 'Calico', 'Russian Blue', 'Bengal'],
  },
  rabbit: {
    names:  ['Thumper', 'Cotton', 'Fluffy', 'Snowball', 'Hoppy', 'Peter', 'Clover', 'Hazel'],
    breeds: ['Holland Lop', 'Flemish Giant', 'Lionhead', 'Dutch', 'Mini Rex'],
  },
  hamster: {
    names:  ['Nibbles', 'Peanut', 'Squeaky', 'Fuzzy', 'Hamlet', 'Chewy'],
    breeds: ['Syrian Hamster', 'Dwarf Hamster'],
  },
  'guinea pig': {
    names:  ['Gizmo', 'Patches', 'Oreo', 'Caramel', 'Butterscotch'],
    breeds: ['American Guinea Pig', 'Abyssinian'],
  },
  parrot: {
    names:  ['Polly', 'Rio', 'Sunny', 'Kiwi', 'Mango', 'Skittles'],
    breeds: ['Macaw', 'Cockatiel', 'Budgie'],
  },
};

const AGE_LABELS = ['6 months', '1 year', '2 years', '3 years', '4 years', 'Baby'];

// Map Unsplash search term → canonical species key
const SEARCH_BATCHES = [
  { query: 'puppy',          species: 'dog',        count: 15 },
  { query: 'kitten',         species: 'cat',        count: 15 },
  { query: 'dog portrait',   species: 'dog',        count: 15 },
  { query: 'cat portrait',   species: 'cat',        count: 15 },
  { query: 'rabbit pet',     species: 'rabbit',     count: 10 },
  { query: 'hamster pet',    species: 'hamster',    count: 10 },
  { query: 'guinea pig pet', species: 'guinea pig', count: 10 },
  { query: 'parrot pet',     species: 'parrot',     count: 10 },
];

// ============================================================
// HELPERS
// ============================================================

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function buildDescription(species, breed) {
  const templates = [
    `Adorable ${species} looking for a loving home. Very friendly and playful!`,
    `Sweet ${breed} ready for adoption. Gets along well with kids and other pets.`,
    `Energetic ${species} seeking an active family. Loves walks and playtime!`,
    `Gentle ${breed} looking for a forever home. Perfect companion animal.`,
  ];
  return pick(templates);
}

function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans); }));
}

// ============================================================
// UNSPLASH FETCHING
// ============================================================

async function fetchUnsplashPhotos(query, perPage) {
  const label = query.charAt(0).toUpperCase() + query.slice(1) + 's';
  console.log(`📸 Fetching ${label} from Unsplash...`);

  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('orientation', 'squarish');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  });

  if (!res.ok) {
    console.error(`   ⚠️  Unsplash request failed for "${query}": ${res.status} ${res.statusText}`);
    return [];
  }

  const data = await res.json();
  const photos = data.results ?? [];
  console.log(`✅ Fetched ${photos.length} ${label}`);
  return photos;
}

// ============================================================
// PET RECORD BUILDER
// ============================================================

function buildPetRecord(photo, species) {
  const { names, breeds } = SPECIES_DATA[species];
  const breed = pick(breeds);
  return {
    name:        pick(names),
    breed,
    species,
    description: buildDescription(species, breed),
    image_url:   photo.urls.regular,
    age_label:   pick(AGE_LABELS),
  };
}

// ============================================================
// VERIFICATION
// ============================================================

async function verifySeeding() {
  console.log('\n--- Verification ---');

  const { count: total, error: countErr } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true });

  if (countErr) { console.error('   Count query failed:', countErr.message); return; }
  console.log(`Total items: ${total}`);

  const { data: bySpecies, error: speciesErr } = await supabase
    .from('items')
    .select('species');

  if (!speciesErr && bySpecies) {
    const counts = bySpecies.reduce((acc, { species }) => {
      acc[species] = (acc[species] ?? 0) + 1;
      return acc;
    }, {});
    console.log('\nBy species:');
    for (const [sp, n] of Object.entries(counts)) {
      console.log(`  ${sp.padEnd(12)} ${n}`);
    }
  }

  const { data: sample, error: sampleErr } = await supabase
    .from('items')
    .select('name, species, breed')
    .limit(5);

  if (!sampleErr && sample) {
    console.log('\nSample pets:');
    console.log('  Name'.padEnd(16) + 'Species'.padEnd(14) + 'Breed');
    console.log('  ' + '-'.repeat(44));
    for (const p of sample) {
      console.log(`  ${p.name.padEnd(14)} ${p.species.padEnd(13)} ${p.breed}`);
    }
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  // 1. Check existing rows
  console.log('\n📊 Checking existing items in database...');
  const { count: existing, error: checkErr } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true });

  if (checkErr) {
    console.error('❌ Could not query items table:', checkErr.message);
    console.error('   Make sure you have run supabase-schema.sql first.');
    process.exit(1);
  }

  if (existing > 0) {
    const answer = await askQuestion(
      `\nItems table has ${existing} rows. Clear and re-seed? (y/n): `
    );
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('Aborted. No changes made.');
      process.exit(0);
    }
    const { error: deleteErr } = await supabase.from('items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (deleteErr) {
      console.error('❌ Failed to clear items table:', deleteErr.message);
      process.exit(1);
    }
    console.log('🗑️  Cleared existing items.');
  }

  // 2. Fetch photos from Unsplash
  console.log('');
  const seenIds = new Set();
  const pets = [];

  for (const batch of SEARCH_BATCHES) {
    const photos = await fetchUnsplashPhotos(batch.query, batch.count);

    for (const photo of photos) {
      if (seenIds.has(photo.id)) continue;
      seenIds.add(photo.id);
      pets.push(buildPetRecord(photo, batch.species));
    }

    // Respect Unsplash rate limit (50 requests/hour for demo apps)
    await delay(250);
  }

  if (pets.length === 0) {
    console.error('❌ No photos fetched. Check your UNSPLASH_ACCESS_KEY and network connection.');
    process.exit(1);
  }

  // 3. Insert into Supabase in batches of 25
  console.log(`\n💾 Inserting ${pets.length} pets into Supabase...`);
  const BATCH_SIZE = 25;

  for (let i = 0; i < pets.length; i += BATCH_SIZE) {
    const chunk = pets.slice(i, i + BATCH_SIZE);
    const { error: insertErr } = await supabase.from('items').insert(chunk);

    if (insertErr) {
      console.error(`❌ Insert failed at row ${i + 1}:`, insertErr.message);
      process.exit(1);
    }

    const inserted = Math.min(i + BATCH_SIZE, pets.length);
    console.log(`✅ Inserted ${inserted}/${pets.length}...`);
  }

  console.log(`\n🎉 Successfully seeded ${pets.length} pets to Supabase!`);

  // 4. Verify
  await verifySeeding();
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
