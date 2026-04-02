// ============================================
// ONE-CLICK LOCALSTORAGE TO DATABASE MIGRATION
// ============================================
// 
// INSTRUCTIONS:
// 1. Make sure you're logged in at http://localhost:3000
// 2. Open browser console (F12 or Cmd+Option+J on Mac)
// 3. Copy and paste this entire script
// 4. Press Enter
// 5. Done!

(async function migrateLocalStorage() {
  console.log('🚀 Starting localStorage migration...\n');
  
  try {
    // Check authentication
    const token = localStorage.getItem('auth_token');
    if (!token) {
      console.error('❌ Not authenticated! Please login first at http://localhost:3000/login.html');
      return;
    }
    
    // Collect all localStorage data
    console.log('📦 Collecting data from localStorage...');
    const data = {
      boxes: JSON.parse(localStorage.getItem('rts.boxes.v1') || '[]'),
      equipment: JSON.parse(localStorage.getItem('rts.equipment.v1') || '[]'),
      assets: JSON.parse(localStorage.getItem('rts.assets.v1') || '[]'),
      boxContents: JSON.parse(localStorage.getItem('rts.box.contents.v1') || '[]'),
      events: JSON.parse(localStorage.getItem('rts.events.v1') || '[]'),
      tasks: JSON.parse(localStorage.getItem('rts.tasks.v1') || '[]')
    };
    
    // Count items
    const totalBoxes = data.boxes.length;
    const totalEquipment = data.equipment.length;
    const totalAssets = data.assets.length;
    const totalContents = data.boxContents.length;
    const totalEvents = data.events.length;
    const totalTasks = data.tasks.length;
    const totalItems = totalEquipment + totalAssets;
    
    console.log(`\n📊 Found:`);
    console.log(`   📦 Boxes: ${totalBoxes}`);
    console.log(`   🔧 Equipment: ${totalEquipment}`);
    console.log(`   📦 Assets: ${totalAssets}`);
    console.log(`   📋 Box Contents: ${totalContents}`);
    console.log(`   📅 Events: ${totalEvents}`);
    console.log(`   ✅ Tasks: ${totalTasks}`);
    console.log(`\n   Total items to migrate: ${totalBoxes + totalItems + totalContents}`);
    
    if (totalBoxes + totalItems + totalContents === 0) {
      console.log('\n⚠️  No data found in localStorage. Nothing to migrate.');
      return;
    }
    
    // Upload to database
    console.log('\n☁️  Uploading to database...');
    const response = await fetch('/api/import-localStorage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }
    
    const result = await response.json();
    
    console.log('\n✅ MIGRATION COMPLETE!\n');
    console.log('📊 Results:');
    console.log(`   Boxes: ${result.results.boxes.inserted} inserted, ${result.results.boxes.updated} updated`);
    console.log(`   Items: ${result.results.items.inserted} inserted, ${result.results.items.updated} updated`);
    console.log(`   Box Contents: ${result.results.boxContents.inserted} inserted, ${result.results.boxContents.updated} updated`);
    
    if (result.results.boxes.errors > 0 || result.results.items.errors > 0) {
      console.log(`\n⚠️  Errors: ${result.results.boxes.errors + result.results.items.errors}`);
    }
    
    console.log('\n🎉 Your data is now in the PlanetScale database!');
    console.log('🌐 Access it at: https://raceteamsoftware.onrender.com/login.html');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.log('\nℹ️  Troubleshooting:');
    console.log('   1. Make sure you are logged in');
    console.log('   2. Check that the server is running');
    console.log('   3. Try refreshing the page and running again');
  }
})();
