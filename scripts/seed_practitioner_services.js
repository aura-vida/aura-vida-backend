// One-off seed: imports services from the "data import sheet for kusala.pdf"
// for the practitioners whose rows were unambiguous in the extracted PDF
// text. Uses the real model function (practitioner_id ownership + duration
// forced to 60) so this behaves exactly like a practitioner creating these
// through their own "My Services" tab.
//
// Run with: node scripts/seed_practitioner_services.js
import 'dotenv/config';
import { createServiceForPractitioner } from '../src/models/service.model.js';
import { supabase } from '../src/config/supabase.js';

const SEED = [
  {
    practitionerName: 'Anindita Singhvi',
    services: [
      { category: 'Yoga', name: 'Online Session (Individual)', price_inr: 2500 },
      { category: 'Yoga', name: "In-person at her studio (Individual)", price_inr: 3000 },
      { category: 'Yoga', name: "Group at her studio (per person)", price_inr: 900 },
      { category: 'Yoga', name: "In-person at client's house/space (Individual)", price_inr: 2000 },
      { category: 'Yoga', name: "Group at client's house/space or online", price_inr: 2000 },
    ],
  },
  {
    practitionerName: 'Chandan',
    services: [
      {
        category: 'Energy Healing',
        name: 'Soul Origin Frequency (Individual, in-person and online)',
        price_inr: 5555,
        description:
          "The Soul Origin Multidimensional Session is a 90-minute once only energetic transmission designed to help you remember who you truly are beyond conditioning, roles, and lifetimes of adaptation. Frequency: the original vibration your soul resonates with and carries from the Highest realms. This begins to feel coherent again. Decisions, actions, Intuition soften, your mind strengthens.",
      },
    ],
  },
  {
    practitionerName: 'Homi',
    services: [
      { category: 'Energy Healing', name: 'Multidimensional Energy Healing — Individual (in-person)', price_inr: 6000 },
      { category: 'Energy Healing', name: 'Multidimensional Energy Healing — Group up to 5 people', price_inr: 15000 },
      { category: 'Energy Healing', name: 'Multidimensional Energy Healing — Group up to 10 people', price_inr: 20000 },
    ],
  },
  {
    practitionerName: 'Johann Arora',
    services: [
      { category: 'Craniosacral Therapy', name: 'Individual session, in-person', price_inr: 2500 },
    ],
  },
  {
    practitionerName: 'Neelam Chheda',
    services: [
      { category: 'Breathwork', name: 'In-person (Individual and group, per person)', price_inr: 2500 },
    ],
  },
  {
    practitionerName: 'Pooja Arora Chopra',
    services: [
      { category: 'Yoga', name: 'Online (Individual and group, per person)', price_inr: 700 },
      { category: 'Sound Healing', name: "In-person at client's house/space (per person)", price_inr: 1700 },
      { category: 'Sound Healing', name: 'Online Session (per person)', price_inr: 1000 },
      { category: 'Breathwork & Meditation', name: 'Online Session (Individual and group, per person)', price_inr: 700 },
    ],
  },
  {
    practitionerName: 'Pooja Singh',
    services: [
      { category: 'Yoga', name: 'Individual personalised yoga session (online, per person)', price_inr: 1250 },
      { category: 'Yoga', name: 'Therapeutic & wellness yoga session (online, per person)', price_inr: 1850 },
      { category: 'Yoga', name: 'Kids Yoga (online, per person)', price_inr: 1250 },
    ],
  },
  {
    practitionerName: 'Prriya Jain',
    services: [
      { category: 'Astrology', name: 'Saturn Cycle & Karmic-Alignment Consultation (Vedic Kundli Analysis, online)', price_inr: 3000 },
      { category: 'Astrology', name: 'Saturn Cycle & Karmic-Alignment Signature Consultation (Vedic Kundli Analysis)', price_inr: 4000 },
      { category: 'Astrology', name: 'Your Cosmic Blueprint Birth Chart Decoding Consultation (Vedic Kundli Analysis, online)', price_inr: 3000 },
      { category: 'Astrology', name: 'Your Cosmic Blueprint Birth Chart Decoding Consultation (Vedic Kundli Analysis, in-person)', price_inr: 4000 },
      { category: 'Astrology / Tarot', name: 'Shadow to Shakti: Soul Pattern Healing Consultation (Advanced Tarot + Oracle channeling, online)', price_inr: 3000 },
    ],
  },
  {
    practitionerName: 'Rhea Jassal',
    services: [
      { category: 'Holistic Life Coaching', name: 'Clarity Conversations (30 mins, online)', price_inr: 1500 },
      { category: 'Holistic Life Coaching', name: 'Holistic Coaching Session — balancing work and life (60 mins, online)', price_inr: 5000 },
      { category: 'Holistic Life Coaching', name: 'Calm Clarity & Reflection Session — Mindfulness, NLP based (60 mins, online)', price_inr: 3000 },
    ],
  },
];

const run = async () => {
  const { data: practitioners, error } = await supabase.from('practitioners').select('id, name');
  if (error) throw error;

  let created = 0;
  for (const entry of SEED) {
    const practitioner = practitioners.find(
      (p) => p.name.trim().toLowerCase() === entry.practitionerName.toLowerCase()
    );
    if (!practitioner) {
      console.log(`SKIP (not found): ${entry.practitionerName}`);
      continue;
    }
    for (const svc of entry.services) {
      const service = await createServiceForPractitioner(practitioner.id, {
        name: svc.name,
        category: svc.category,
        price_inr: svc.price_inr,
        description: svc.description || null,
        is_active: true,
      });
      created++;
      console.log(`✅ ${entry.practitionerName}: "${service.name}" (₹${service.price_inr}) [${service.id}]`);
    }
  }
  console.log(`\nDone — ${created} services created.`);
};

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
