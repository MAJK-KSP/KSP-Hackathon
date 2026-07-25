const fs = require('fs');
const path = require('path');

async function translateText(text) {
  try {
    const res = await fetch('http://127.0.0.1:8000/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target_language: 'kn' })
    });
    const data = await res.json();
    return data.translated_text || text;
  } catch (err) {
    console.error('Translation error for', text, err);
    return text;
  }
}

async function main() {
  const missingStrings = [
    "Command Center",
    "Duty Roster & Tasks",
    "Terminal Diagnostics",
    "AI Datasets",
    "Officer Badge",
    "Clearance",
    "LIVE DISPATCH CONNECTED",
    "Refresh Briefings",
    "Station Daily Briefing",
    "Bulletins",
    "Fetching station briefing...",
    "Station Operational — All Clear",
    "No urgent bulletins or dispatches assigned for your station today. Standard watch applies.",
    "View Full Roster & Past Logs",
    "Acknowledged",
    "Mark Acknowledged",
    "View All Station Briefings & Roster",
    "AI Intelligence Assistant",
    "24/7 Investigative Copilot",
    "Ask the KSP AI Copilot to analyze FIR files, look up penal codes, summarize crime trends, or generate shift intelligence reports.",
    "Quick Assistant Actions",
    "Search IPC / Legal Provisions",
    "Analyze Crime Telemetry",
    "Draft Shift Summary",
    "Query FIR Records",
    "Launch AI Assistant Copilot",
    "Secured with end-to-end audit logging",
    "Daily Security Checklist",
    "Low",
    "Normal",
    "High",
    "Urgent",
    "System Diagnostics & Connection Status",
    "Run Diagnostics",
    "Register Operational Dataset",
    "Table Name",
    "Dataset Description",
    "Live Database Search Autocomplete",
    "Type to search suspect name, FIR number, or crime category...",
    "Karnataka State Police FIR Generator",
    "Form Editor",
    "2-Page Document Preview",
    "Save FIR Record",
    "Print / Download 2-Page PDF",
    "Crime Heat Density",
    "Search by FIR ID, landmark, or suspect...",
    "Cluster Location Inspection",
    "Cases",
    "Cluster Coordinates",
    "Dominant Station",
    "Cases in this Cluster",
    "Inspect Dossier",
    "Zoom into Area",
    "Location & FIR Case Dossier",
    "Closed / Solved",
    "Active Incident",
    "FIR / Case Number",
    "Crime Category",
    "Reported Date",
    "Coordinates",
    "Case Brief Facts & Particulars",
    "Open in Google Maps",
    "Ask AI Assistant about this Case",
    "Tactical Criminal Network & Relationship Analysis",
    "Add Entity",
    "Search suspect, witness, vehicle, or FIR number...",
    "Search criminal gang suspect name or alias...",
    "Role-Based Access Control & User Administration",
    "Manage investigator, analyst, supervisor, and policymaker access credentials with cryptographic audit logging.",
    "Create New User",
    "User Directory & Roles",
    "Cryptographic Audit Trail",
    "Loading user credentials...",
    "User Email",
    "Assigned RBAC Role",
    "Station / Badge",
    "MFA Status",
    "Created Date",
    "Change Role",
    "Actions",
    "Enabled",
    "Disabled",
    "Delete User",
    "Action",
    "Admin",
    "Target User",
    "Role",
    "Timestamp",
    "No RBAC audit logs recorded yet.",
    "Create User & Assign RBAC Role",
    "User Email Address",
    "Password",
    "Assign RBAC Role",
    "Station / Post",
    "Create Account & Assign Role",
    "COMMAND & OPERATIONS",
    "FIR Generator",
    "INTELLIGENCE SUITE",
    "SYSTEM & SECURITY"
  ];

  let additions = `\n  // Auto-translated missing UI strings\n`;
  for (const text of missingStrings) {
    if (text.length < 2) continue;
    const translated = await translateText(text);
    console.log(`Translated: ${text} -> ${translated}`);
    additions += `  "${text.replace(/"/g, '\\"')}": "${translated.replace(/"/g, '\\"')}",\n`;
  }
  
  const srcDir = path.join(__dirname, 'frontend/src');
  const langContextPath = path.join(srcDir, 'LanguageContext.tsx');
  let langContext = fs.readFileSync(langContextPath, 'utf8');
  
  // Find the end of the dictionary
  const dictEndIndex = langContext.indexOf('};', langContext.indexOf('const dictionary: Record<string, string> = {'));
  
  if (dictEndIndex > -1) {
    // Check if there's a trailing comma before the closing brace, if not, add one before appending
    const beforeClosing = langContext.substring(0, dictEndIndex).trim();
    const needsComma = !beforeClosing.endsWith(',');
    
    let replacement = needsComma ? ',' : '';
    replacement += additions + '\n';
    
    langContext = langContext.substring(0, dictEndIndex) + replacement + langContext.substring(dictEndIndex);
    fs.writeFileSync(langContextPath, langContext, 'utf8');
    console.log('Successfully appended missing strings to LanguageContext.tsx dictionary.');
  }
}

main();
