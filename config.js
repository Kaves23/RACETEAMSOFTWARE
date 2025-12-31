// Global configuration - single source of truth for shared lists.
// Include this before core.js on pages where you want to override defaults.
window.RTS_CONFIG = {
  settings: {
    venues: [
      { id:'redstar', name:'Red Star Raceway', location:'Delmas, Gauteng', notes:'Clockwise/anti-clockwise, windy' },
      { id:'killarney', name:'Killarney Kart Track', location:'Cape Town, Western Cape', notes:'Coastal, wind-sensitive' },
      { id:'idube', name:'iDube Kart Circuit', location:'KwaZulu-Natal', notes:'Elevation, technical' },
      { id:'formulak', name:'Formula K', location:'Benoni, Gauteng', notes:'High speed, chicanes' },
      { id:'zwartkops', name:'Zwartkops Kart Circuit', location:'Pretoria, Gauteng', notes:'Club layout, braking focus' },
      { id:'rheebok', name:'Rheebok', location:'George, Western Cape', notes:'Coastal, flowing' }
    ],
    eventTypes: [
      { code:'National Weekend', color:'#e32636' },
      { code:'Regional Weekend', color:'#ff7a1a' },
      { code:'Test Day', color:'#0ea5e9' },
      { code:'Promo / Media', color:'#a855f7' },
      { code:'International Trip', color:'#22c55e' },
      { code:'Travel Day', color:'#facc15' }
    ]
  }
};
