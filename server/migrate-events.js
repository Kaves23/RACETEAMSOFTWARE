// Migrate events from localStorage to database
const { pool } = require('./db');

// Events from the screenshot
const events = [
  {
    id: 'event_001',
    name: 'Test Day – Setup',
    start_date: '2026-03-07',
    end_date: '2026-03-07',
    event_type: 'National Weekend',
    status: 'Closed',
    circuit: 'Red Star Raceway',
    brief: 'Pre-season setup and testing',
    drivers: [],
    crew: [
      { staffId: '', role: 'Team Manager' },
      { staffId: '', role: 'Race Engineer' },
      { staffId: '', role: 'Mechanic' }
    ],
    documents: [
      { provider: 'link', name: 'Supplementary Regulations', url: 'supp-regs.pdf' },
      { provider: 'link', name: 'Timetable', url: '' }
    ]
  },
  {
    id: 'event_002',
    name: 'National Weekend – R2',
    start_date: '2026-03-21',
    end_date: '2026-03-23',
    event_type: 'Regional Weekend',
    status: 'Closed',
    circuit: 'Killarney Kart Track',
    brief: 'Key timetable items, goals, constraints, sponsor deliverables...',
    drivers: [],
    crew: [
      { staffId: '', role: 'Team Manager' },
      { staffId: '', role: 'Race Engineer' },
      { staffId: '', role: 'Mechanic #1' }
    ],
    documents: []
  },
  {
    id: 'event_003',
    name: 'Test Day – Setup',
    start_date: '2026-04-04',
    end_date: '2026-04-04',
    event_type: 'Test Day',
    status: 'Closed',
    circuit: 'iDube Kart Circuit',
    brief: '',
    drivers: [],
    crew: [],
    documents: []
  },
  {
    id: 'event_004',
    name: 'National Day – R4',
    start_date: '2026-04-18',
    end_date: '2026-04-20',
    event_type: 'Promo / Media',
    status: 'Open',
    circuit: 'Formula K',
    brief: '',
    drivers: [],
    crew: [],
    documents: []
  },
  {
    id: 'event_005',
    name: 'Test Day – Setup',
    start_date: '2026-05-02',
    end_date: '2026-05-02',
    event_type: 'International Trip',
    status: 'Open',
    circuit: 'Zwartkops Kart Circuit',
    brief: '',
    drivers: [],
    crew: [],
    documents: []
  },
  {
    id: 'event_006',
    name: 'Provincial Cup – R6',
    start_date: '2026-05-18',
    end_date: '2026-05-18',
    event_type: 'Travel Day',
    status: 'Open',
    circuit: 'Pietersburg',
    brief: '',
    drivers: [],
    crew: [],
    documents: []
  },
  {
    id: 'event_007',
    name: 'Test Day – Setup',
    start_date: '2026-05-30',
    end_date: '2026-05-30',
    event_type: 'National Weekend',
    status: 'Planned',
    circuit: 'Red Star Raceway',
    brief: '',
    drivers: [],
    crew: [],
    documents: []
  },
  {
    id: 'event_008',
    name: 'National Weekend – R8',
    start_date: '2026-06-13',
    end_date: '2026-06-15',
    event_type: 'Regional Weekend',
    status: 'Planned',
    circuit: 'Killarney Kart Track',
    brief: '',
    drivers: [],
    crew: [],
    documents: []
  },
  {
    id: 'event_009',
    name: 'Test Day – Setup',
    start_date: '2026-06-27',
    end_date: '2026-06-27',
    event_type: 'Test Day',
    status: 'Planned',
    circuit: 'iDube Kart Circuit',
    brief: '',
    drivers: [],
    crew: [],
    documents: []
  },
  {
    id: 'event_010',
    name: 'National Weekend – R10',
    start_date: '2026-07-11',
    end_date: '2026-07-13',
    event_type: 'Promo / Media',
    status: 'Planned',
    circuit: 'Formula K',
    brief: '',
    drivers: [],
    crew: [],
    documents: []
  }
];

async function migrate() {
  try {
    console.log('🚀 Starting event migration...\n');
    
    let success = 0;
    let failed = 0;
    
    for (const event of events) {
      try {
        const result = await pool.query(
          `INSERT INTO events (
            id, name, start_date, end_date, event_type, status, circuit, 
            brief, drivers, crew, documents, runbook, setups, run_plan, checklists, session_logs
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO NOTHING
          RETURNING id`,
          [
            event.id,
            event.name,
            event.start_date,
            event.end_date,
            event.event_type,
            event.status,
            event.circuit,
            event.brief || '',
            JSON.stringify(event.drivers || []),
            JSON.stringify(event.crew || []),
            JSON.stringify(event.documents || []),
            JSON.stringify({}),  // runbook
            JSON.stringify([]),  // setups
            JSON.stringify([]),  // run_plan
            JSON.stringify([]),  // checklists
            JSON.stringify({})   // session_logs
          ]
        );
        
        if (result.rowCount > 0) {
          console.log(`✅ Migrated: ${event.name} (${event.start_date})`);
          success++;
        } else {
          console.log(`⏭️  Skipped (already exists): ${event.name}`);
        }
      } catch (error) {
        console.error(`❌ Failed to migrate ${event.name}:`, error.message);
        failed++;
      }
    }
    
    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Successfully migrated: ${success} events`);
    console.log(`   ❌ Failed: ${failed} events`);
    
    // Verify
    const count = await pool.query('SELECT COUNT(*) as cnt FROM events');
    console.log(`\n📅 Total events in database: ${count.rows[0].cnt}`);
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    await pool.end();
    process.exit(1);
  }
}

migrate();
