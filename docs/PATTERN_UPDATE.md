# JSON File Pattern Update

## Overview
Updated ignore patterns to be more explicit and eliminate Shopify CLI warnings about "Directory pattern may be misleading."

## Pattern Changes

### Previous Pattern
```
templates/**/*.json  # Only matches files in subdirectories
sections/**/*.json
```

### New Pattern  
```
templates/*.json      # Matches files directly in templates/
templates/**/*.json   # Matches files in subdirectories
sections/*.json       # Matches files directly in sections/
snippets/*.json       # Matches files directly in snippets/
blocks/*.json         # Matches files directly in blocks/
locales/*.json        # Matches files directly in locales/
```

## What This Covers

The updated patterns ensure we ignore ALL JSON files:

### Templates Directory
- ✅ `templates/product.json` (direct files)
- ✅ `templates/index.json` (direct files)
- ✅ `templates/customers/login.json` (subdirectory files)
- ✅ `templates/metaobject/author.json` (subdirectory files)

### Other Directories
- ✅ `sections/header.json` (section settings)
- ✅ `snippets/product-card.json` (snippet settings)
- ✅ `blocks/newsletter.json` (block settings)
- ✅ `locales/en.default.json` (translations)
- ✅ `config/settings_data.json` (theme settings)

## Why Both Patterns?

While `**/*.json` technically matches files at any depth (including zero depth), being explicit with both patterns:
1. Eliminates Shopify CLI warnings
2. Makes the intent clearer
3. Ensures compatibility with different glob implementations
4. Provides better documentation of what's being ignored

## Impact

This change:
- ✅ Fixes Shopify CLI warnings about misleading patterns
- ✅ Maintains the same functionality (all JSON files still ignored in production)
- ✅ Makes patterns more explicit and readable
- ✅ No breaking changes

## Files Updated

- `src/modes/production.js` - Production deployment ignore patterns
- `src/modes/sync-live.js` - Live sync JSON patterns
- `src/utils/config.js` - Default configuration patterns

## Testing

The patterns have been tested to ensure they correctly:
1. Ignore all JSON files during production Phase A
2. Only push `locales/en.default.json` in Phase B
3. Properly sync JSON files in sync-live mode
