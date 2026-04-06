# How to Add Screenshots to the User Manual

The Asset Management User Manual has been created with placeholder areas for screenshots. Here's how to add real screenshots:

## Quick Steps

1. **Take Screenshots**
   - Open the Race Team OS at https://raceteamsoftware.onrender.com
   - Navigate to Assets (Logistics → Assets)
   - Take screenshots for each placeholder section
   - Save as PNG or JPG files

2. **Screenshot List Needed:**

   ### Section 2: Accessing the Page
   - `screenshot-1-logistics-menu.png` - Top navigation showing Logistics button
   - `screenshot-2-logistics-modal.png` - Quick-select modal with Assets highlighted
   - `screenshot-3-assets-page.png` - Full Asset Management page with three columns

   ### Section 3: Adding a New Asset
   - `screenshot-4-add-button.png` - Add Asset button in toolbar
   - `screenshot-5-empty-form.png` - Empty asset modal with all tabs
   - `screenshot-6-basic-info.png` - Basic Information section filled in
   - `screenshot-7-technical.png` - Technical Details section
   - `screenshot-8-location-tab.png` - Location & Tracking tab
   - `screenshot-9-save-button.png` - Save button at bottom of form
   - `screenshot-10-success.png` - Success message and new asset in list

   ### Section 4: Editing an Asset
   - `screenshot-11-search-filter.png` - Search and filter panel in use
   - `screenshot-12-asset-selected.png` - Selected/highlighted asset
   - `screenshot-13-right-panel.png` - Right panel with asset details
   - `screenshot-14-editing.png` - Fields being modified
   - `screenshot-15-save-changes.png` - Save Changes button
   - `screenshot-16-update-confirm.png` - Update confirmation message

3. **Add Screenshots to the Manual:**

   Option A: **Using an Image Editor**
   - Open USER_MANUAL_ASSETS.html in a code editor
   - Find each `<div class="screenshot-placeholder">` section
   - Replace the entire div with: `<img src="screenshot-X.png" alt="Description" style="width: 100%; border: 1px solid #ddd; border-radius: 8px; margin: 20px 0;">`

   Option B: **Create a Screenshots Folder**
   - Create folder: `RACE TEAM SOFTWARE V5/manual-screenshots/`
   - Save all screenshots there
   - Update img src to: `manual-screenshots/screenshot-X.png`

## Example Replacement

**Find this:**
```html
<div class="screenshot-placeholder">
  <div class="icon">📸</div>
  <div class="text">Screenshot: Click "Logistics" in top menu</div>
  <div class="subtext">Shows the Logistics button highlighted in the navigation bar</div>
</div>
```

**Replace with:**
```html
<img src="manual-screenshots/logistics-button.png" 
     alt="Logistics button in navigation" 
     style="width: 100%; border: 2px solid #e0e0e0; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
<p style="text-align: center; color: #666; font-size: 0.9rem; margin-top: 10px;">
  <em>The Logistics button in the top navigation bar</em>
</p>
```

## Taking Good Screenshots

### Tips:
- **Size:** Use 1920x1080 resolution or at least 1280x720
- **Highlight Important Areas:** Use circles or arrows to draw attention
- **Clean UI:** Close unnecessary browser tabs/windows in background
- **Consistent:** Take all screenshots in same browser at same zoom level
- **Format:** PNG preferred for better quality, JPG for smaller files

### Tools:
- **Mac:** Cmd+Shift+4 (select area) or Cmd+Shift+5 (screenshot toolbar)
- **Windows:** Win+Shift+S (Snipping Tool)
- **Annotation:** Mac Preview, Windows Snip & Sketch, or Skitch

### What to Capture:

1. **Full Page Screenshots:** Show entire interface with all three columns
2. **Detail Shots:** Zoom in on specific buttons, forms, or features
3. **Highlight Actions:** Circle or arrow pointing to buttons being clicked
4. **Success States:** Capture confirmation messages and results
5. **Before/After:** Show changes (e.g., empty form → filled form)

## Publishing the Updated Manual

After adding screenshots:

```bash
cd "/Users/John/Dropbox/RACE TEAM SOFTWARE V5"
git add USER_MANUAL_ASSETS.html manual-screenshots/*.png
git commit -m "Add screenshots to Asset Management user manual"
git push origin main
```

The manual will be available at:
- **Production:** https://raceteamsoftware.onrender.com/USER_MANUAL_ASSETS.html
- **Local:** Open the file directly in your browser

## Print/PDF Version

To create a PDF:
1. Open USER_MANUAL_ASSETS.html in Chrome/Edge
2. Press Ctrl+P (Windows) or Cmd+P (Mac)
3. Select "Save as PDF" as destination
4. Adjust margins if needed
5. Save as "Asset_Management_Manual.pdf"

The manual is designed with page breaks and print-friendly styling.

---

**Note:** The manual is already live and functional with placeholder text. Screenshots will make it more visual and easier to follow for new users!
