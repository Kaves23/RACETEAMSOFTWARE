// Clear all box associations - removes all items from boxes
require('dotenv').config();
const db = require('./db');

async function clearAllBoxContents() {
  try {
    console.log('🧹 Clearing all box associations...\n');
    
    // Clear box_contents table
    const deleteResult = await db.query('DELETE FROM box_contents');
    console.log(`✅ Deleted ${deleteResult.rowCount} entries from box_contents table`);
    
    // Clear current_box_id from items
    const updateItemsResult = await db.query(
      'UPDATE items SET current_box_id = NULL WHERE current_box_id IS NOT NULL'
    );
    console.log(`✅ Cleared box assignment from ${updateItemsResult.rowCount} items`);
    
    // Clear current_box_id from inventory
    const updateInventoryResult = await db.query(
      'UPDATE inventory SET current_box_id = NULL WHERE current_box_id IS NOT NULL'
    );
    console.log(`✅ Cleared box assignment from ${updateInventoryResult.rowCount} inventory items`);
    
    console.log('\n✨ All items removed from boxes! You can now pack boxes fresh.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
  
  process.exit(0);
}

clearAllBoxContents();
