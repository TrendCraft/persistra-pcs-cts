#!/bin/bash

# Find all missing modules by attempting to run tests and capturing errors
# This script iteratively finds missing modules until none remain

set -e

REPO_DIR="/Users/stephenmansfield/Projects/persistra-pcs-cts"
LEO_DIR="/Users/stephenmansfield/Projects/Leo"
TEMP_DIR="/tmp/pcs-cts-missing-check"

echo "Finding all missing modules..."
echo ""

# Clean temp directory
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Clone current state
cd "$TEMP_DIR"
git clone "$REPO_DIR" test-repo
cd test-repo
npm ci > /dev/null 2>&1

# Create dummy .env
cat > .env << 'EOF'
ANTHROPIC_API_KEY=dummy-key-for-import-check
LEO_POLICY_ENFORCEMENT=true
LEO_POLICY_AUDIT=true
LEO_VISION_HISTORY_MAX=0
EOF

# Try to run validation script and capture missing modules
echo "Attempting to load test modules..."
node scripts/validate-imports.js 2>&1 | grep "Cannot find module" | sed "s/.*Cannot find module '//g" | sed "s/'.*//g" | sort -u > /tmp/missing-modules.txt

if [ -s /tmp/missing-modules.txt ]; then
    echo "Found missing modules:"
    cat /tmp/missing-modules.txt
    echo ""
    echo "Searching for these modules in Leo project..."
    
    while IFS= read -r module; do
        # Remove leading ../
        clean_module=$(echo "$module" | sed 's|^\.\./||g' | sed 's|^\./||g')
        
        # Try to find the module in Leo project
        if [ -f "$LEO_DIR/$clean_module.js" ]; then
            echo "  Found: $LEO_DIR/$clean_module.js"
        elif [ -f "$LEO_DIR/$clean_module" ]; then
            echo "  Found: $LEO_DIR/$clean_module"
        else
            # Try searching for the module name
            module_name=$(basename "$clean_module")
            find_result=$(find "$LEO_DIR" -name "$module_name.js" -o -name "$module_name" 2>/dev/null | head -1)
            if [ -n "$find_result" ]; then
                echo "  Found: $find_result"
            else
                echo "  NOT FOUND: $module"
            fi
        fi
    done < /tmp/missing-modules.txt
else
    echo "✅ No missing modules found!"
fi

# Cleanup
rm -rf "$TEMP_DIR"
