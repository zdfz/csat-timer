
// Helper to clean up filenames from previous step suffixes
export const getCleanFileName = (originalName) => {
    // Remove extension first if passed (though usually file.name has it)
    let name = originalName.replace(/\.[^/.]+$/, "");

    // Remove existing patterns like " | STEP 1", "_STEP 1", " | STEP 1 | STEP 2"
    // Regex explanation:
    // ( \| STEP \d+|_STEP \d+| - STEP \d+) matches the common suffixes
    // We replace them globally with empty string
    return name.replace(/(\s\|\sSTEP\s\d+|[\s_]STEP\s\d+|[\s_]STEP\d+)+/gi, "").trim();
};
