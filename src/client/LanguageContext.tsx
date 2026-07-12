import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Local Translation Dictionary
const dictionary: Record<string, string> = {
  // Headers & Sidebar
  "KARNATAKA STATE POLICE": "ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್",
  "SECURE COMMAND TERMINAL": "ಸುರಕ್ಷಿತ ಕಮಾಂಡ್ ಟರ್ಮಿನಲ್",
  "Sign Out": "ಸೈನ್ ಔಟ್",
  "Authenticated Officer": "ದೃಢೀಕೃತ ಅಧಿಕಾರಿ",
  "Overview": "ಅವಲೋಕನ",
  "Officer Profile": "ಅಧಿಕಾರಿ ಪ್ರೊಫೈಲ್",
  "MFA Security": "ಎಂಎಫ್ಎ ಭದ್ರತೆ",
  "AI Assistant": "ಎಐ ಸಹಾಯಕ",
  "Loading...": "ಲೋಡ್ ಆಗುತ್ತಿದೆ...",
  
  // Dashboard AI Elements
  "Welcome to Command Terminal": "ಕಮಾಂಡ್ ಟರ್ಮಿನಲ್‌ಗೆ ಸುಸ್ವಾಗತ",
  "System Status": "ಸಿಸ್ಟಮ್ ಸ್ಥಿತಿ",
  "Active Cases": "ಸಕ್ರಿಯ ಪ್ರಕರಣಗಳು",
  "Briefing Alerts": "ಮಾಹಿತಿ ಎಚ್ಚರಿಕೆಗಳು",
  "Security Status": "ಭದ್ರತಾ ಸ್ಥಿತಿ",
  "Daily Briefing & Tasks": "ದೈನಂದಿನ ಮಾಹಿತಿ ಮತ್ತು ಕಾರ್ಯಗಳು",
  "Below are the current tasks, role summaries, and orders dispatched for you today.": "ಇಂದು ನಿಮಗಾಗಿ ಕಳುಹಿಸಲಾದ ಪ್ರಸ್ತುತ ಕಾರ್ಯಗಳು, ಪಾತ್ರದ ಸಾರಾಂಶಗಳು ಮತ್ತು ಆದೇಶಗಳು ಕೆಳಗಿವೆ.",
  "Effective": "ಪರಿಣಾಮಕಾರಿ",
  "Dispatch Daily Briefing": "ದೈನಂದಿನ ಮಾಹಿತಿಯನ್ನು ರವಾನಿಸಿ",
  "As an Administrator, you can dispatch task updates or briefings to officers.": "ನಿರ್ವಾಹಕರಾಗಿ, ನೀವು ಅಧಿಕಾರಿಗಳಿಗೆ ಕಾರ್ಯ ನವೀಕರಣಗಳು ಅಥವಾ ಮಾಹಿತಿಯನ್ನು ರವಾನಿಸಬಹುದು.",
  "Briefing Title": "ಮಾಹಿತಿ ಶೀರ್ಷಿಕೆ",
  "Briefing / Daily Instruction Content": "ಮಾಹಿತಿ / ದೈನಂದಿನ ಸೂಚನೆಯ ವಿಷಯ",
  "Priority Level": "ಆದ್ಯತೆಯ ಮಟ್ಟ",
  "Effective Date": "ಪರಿಣಾಮಕಾರಿ ದಿನಾಂಕ",
  "Optional Targeting (All broadcast if empty)": "ಐಚ್ಛಿಕ ಗುರಿಪಡಿಸುವಿಕೆ (ಖಾಲಿಯಾಗಿದ್ದರೆ ಎಲ್ಲರಿಗೂ ಪ್ರಸಾರವಾಗುತ್ತದೆ)",
  "Target Role": "ಗುರಿ ಪಾತ್ರ",
  "All Roles": "ಎಲ್ಲಾ ಪಾತ್ರಗಳು",
  "Officer Only": "ಅಧಿಕಾರಿ ಮಾತ್ರ",
  "Admin Only": "ನಿರ್ವಾಹಕರು ಮಾತ್ರ",
  "Target Station": "ಗುರಿ ಠಾಣೆ",
  "Target Officer User ID (Direct)": "ಗುರಿ ಅಧಿಕಾರಿ ಬಳಕೆದಾರ ಐಡಿ (ನೇರ)",
  "Dispatching...": "ರವಾನಿಸಲಾಗುತ್ತಿದೆ...",
  "Dispatch Briefing": "ಮಾಹಿತಿಯನ್ನು ರವಾನಿಸಿ",
  "Officer Assignment Information": "ಅಧಿಕಾರಿ ನಿಯೋಜನೆ ಮಾಹಿತಿ",
  "Your currently logged-in officer profile details.": "ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಲಾಗಿನ್ ಆಗಿರುವ ಅಧಿಕಾರಿ ಪ್ರೊಫೈಲ್ ವಿವರಗಳು.",
  "Badge Number": "ಬ್ಯಾಡ್ಜ್ ಸಂಖ್ಯೆ",
  "Police Station": "ಪೊಲೀಸ್ ಠಾಣೆ",
  "Jurisdiction": "ವ್ಯಾಪ್ತಿ",
  "Please configure your officer profile in the Profile settings tab.": "ದಯವಿಟ್ಟು ಪ್ರೊಫೈಲ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳ ಟ್ಯಾಬ್‌ನಲ್ಲಿ ನಿಮ್ಮ ಅಧಿಕಾರಿ ಪ್ರೊಫೈಲ್ ಅನ್ನು ಕಾನ್ಫಿಗರ್ ಮಾಡಿ.",
  "LOW": "ಕಡಿಮೆ",
  "NORMAL": "ಸಾಮಾನ್ಯ",
  "HIGH": "ಹೆಚ್ಚು",
  "URGENT": "ತುರ್ತು",
  "Low": "ಕಡಿಮೆ",
  "Normal": "ಸಾಮಾನ್ಯ",
  "High": "ಹೆಚ್ಚು",
  "Urgent": "ತುರ್ತು",

  // Profile Page
  "Officer Profile Details": "ಅಧಿಕಾರಿ ಪ್ರೊಫೈಲ್ ವಿವರಗಳು",
  "Keep your official information up-to-date. This data is used for official logging, jurisdiction verification, and audit purposes.": "ನಿಮ್ಮ ಅಧಿಕೃತ ಮಾಹಿತಿಯನ್ನು ನವೀಕೃತವಾಗಿರಿಸಿ. ಈ ಡೇಟಾವನ್ನು ಅಧಿಕೃತ ಲಾಗಿಂಗ್, ವ್ಯಾಪ್ತಿ ಪರಿಶೀಲನೆ ಮತ್ತು ಆಡಿಟ್ ಉದ್ದೇಶಗಳಿಗಾಗಿ ಬಳಸಲಾಗುತ್ತದೆ.",
  "Badge / ID Number": "ಬ್ಯಾಡ್ಜ್ / ಐಡಿ ಸಂಖ್ಯೆ",
  "Rank": "ಹುದ್ದೆ (Rank)",
  "Select Rank...": "ಹುದ್ದೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ...",
  "Superintendent of Police (SP)": "ಸೂಪರಿಂಟೆಂಡೆಂಟ್ ಆಫ್ ಪೊಲೀಸ್ (SP)",
  "Deputy Superintendent of Police (DySP)": "ಡೆಪ್ಯುಟಿ ಸೂಪರಿಂಟೆಂಡೆಂಟ್ ಆಫ್ ಪೊಲೀಸ್ (DySP)",
  "Inspector of Police": "ಇನ್ಸ್‌ಪೆಕ್ಟರ್ ಆಫ್ ಪೊಲೀಸ್",
  "Sub-Inspector of Police (PSI)": "ಸಬ್-ಇನ್ಸ್‌ಪೆಕ್ಟರ್ ಆಫ್ ಪೊಲೀಸ್ (PSI)",
  "Assistant Sub-Inspector (ASI)": "ಅಸಿಸ್ಟೆಂಟ್ ಸಬ್-ಇನ್ಸ್‌ಪೆಕ್ಟರ್ (ASI)",
  "Head Constable": "ಹೆಡ್ ಕಾನ್‌ಸ್ಟೇಬಲ್",
  "Constable": "ಕಾನ್‌ಸ್ಟೇಬಲ್",
  "Designation / Post": "ಹುದ್ದೆ / ಪೋಸ್ಟ್",
  "Select Designation...": "ಹುದ್ದೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ...",
  "Station House Officer (SHO)": "ಸ್ಟೇಷನ್ ಹೌಸ್ ಆಫೀಸರ್ (SHO)",
  "Investigating Officer (IO)": "ತನಿಖಾಧಿಕಾರಿ (IO)",
  "Duty Officer": "ಡ್ಯೂಟಿ ಆಫೀಸರ್",
  "Crime Branch Head": "ಕ್ರೈಮ್ ಬ್ರಾಂಚ್ ಹೆಡ್",
  "Traffic In-charge": "ಟ್ರಾಫಿಕ್ ಇನ್‌ಚಾರ್ಜ್",
  "Patrol Officer": "ಪೆಟ್ರೋಲ್ ಆಫೀಸರ್",
  "Jurisdiction": "商ಪತಿ (Jurisdiction)",
  "Select Jurisdiction...": "ವ್ಯಾಪ್ತಿಯನ್ನು ಆಯ್ಕೆಮಾಡಿ...",
  "Bengaluru City Police": "ಬೆಂಗಳೂರು ನಗರ ಪೊಲೀಸ್",
  "Mysuru City Police": "ಮೈಸೂರು ನಗರ ಪೊಲೀಸ್",
  "Mangaluru City Police": "ಮಂಗಳೂರು ನಗರ ಪೊಲೀಸ್",
  "Hubballi-Dharwad City Police": "ಹುಬ್ಬಳ್ಳಿ-ಧಾರವಾಡ ನಗರ ಪೊಲೀಸ್",
  "Belagavi City Police": "ಬೆಳಗಾವಿ ನಗರ ಪೊಲೀಸ್",
  "Kalaburagi City Police": "ಕಲಬುರಗಿ ನಗರ ಪೊಲೀಸ್",
  "Assigned Area": "ನಿಯೋಜಿತ ಪ್ರದೇಶ",
  "Select Assigned Area...": "ನಿಯೋಜಿತ ಪ್ರದೇಶವನ್ನು ಆಯ್ಕೆಮಾಡಿ...",
  "Koramangala": "ಕೋರಮಂಗಲ",
  "Indiranagar": "ಇಂದಿರಾನಗರ",
  "Whitefield": "ವೈಟ್‌ಫೀಲ್ಡ್",
  "Jayanagar": "ಜಯನಗರ",
  "Ulsoor": "ಹಲಸೂರು (Ulsoor)",
  "M.G. Road": "ಎಂ.ಜಿ. ರಸ್ತೆ",
  "Hebbal": "ಹೆಬ್ಬಾಳ",
  "Malleshwaram": "ಮಲ್ಲೇಶ್ವರಂ",
  "Police Station": "ಪೊಲೀಸ್ ಠಾಣೆ",
  "Select Police Station...": "ಪೊಲೀಸ್ ಠಾಣೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ...",
  "Koramangala Police Station": "ಕೋರಮಂಗಲ ಪೊಲೀಸ್ ಠಾಣೆ",
  "Indiranagar Police Station": "ಇಂದಿರಾನಗರ ಪೊಲೀಸ್ ಠಾಣೆ",
  "Whitefield Police Station": "ವೈಟ್‌ಫೀಲ್ಡ್ ಪೊಲೀಸ್ ಠಾಣೆ",
  "Jayanagar Police Station": "ಜಯನಗರ ಪೊಲೀಸ್ ಠಾಣೆ",
  "Ulsoor Police Station": "ಹಲಸೂರು ಪೊಲೀಸ್ ಠಾಣೆ",
  "Malleshwaram Police Station": "ಮಲ್ಲೇಶ್ವರಂ ಪೊಲೀಸ್ ಠಾಣೆ",
  "Cubbon Park Police Station": "ಕಬ್ಬನ್ ಪಾರ್ಕ್ ಪೊಲೀಸ್ ಠಾಣೆ",
  "Save Profile Details": "ಪ್ರೊಫೈಲ್ ವಿವರಗಳನ್ನು ಉಳಿಸಿ",

  // MFA Security Page
  "Multi-Factor Authentication (MFA / 2FA)": "ಮಲ್ಟಿ-ಫ್ಯಾಕ್ಟರ್ ಅಥೆಂಟಿಕೇಶನ್ (MFA / 2FA)",
  "MFA adds an extra layer of security to your account. In addition to your password, you will need a verification code from your authenticator app.": "MFA ನಿಮ್ಮ ಖಾತೆಗೆ ಹೆಚ್ಚುವರಿ ಭದ್ರತೆಯನ್ನು ಸೇರಿಸುತ್ತದೆ. ನಿಮ್ಮ ಪಾಸ್‌ವರ್ಡ್ ಜೊತೆಗೆ, ನಿಮ್ಮ ಅಥೆಂಟಿಕೇಟರ್ ಅಪ್ಲಿಕೇಶನ್‌ನಿಂದ ನಿಮಗೆ ಪರಿಶೀಲನಾ ಕೋಡ್ ಅಗತ್ಯವಿರುತ್ತದೆ.",
  "MFA is currently disabled": "MFA ಪ್ರಸ್ತುತ ನಿಷ್ಕ್ರಿಯಗೊಳಿಸಲಾಗಿದೆ",
  "It is highly recommended to enable MFA immediately to secure your KSP account.": "ನಿಮ್ಮ KSP ಖಾತೆಯನ್ನು ಸುರಕ್ಷಿತಗೊಳಿಸಲು ತಕ್ಷಣವೇ MFA ಅನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಲು ಬಲವಾಗಿ ಶಿಫಾರಸು ಮಾಡಲಾಗಿದೆ.",
  "Configure 2FA Token": "2FA ಟೋಕನ್ ಕಾನ್ಫಿಗರ್ ಮಾಡಿ",
  "Scan this QR code with Google Authenticator, Authy, or Microsoft Authenticator.": "Google Authenticator, Authy ಅಥವಾ Microsoft Authenticator ನೊಂದಿಗೆ ಈ QR ಕೋಡ್ ಅನ್ನು ಸ್ಕ್ಯಾನ್ ಮಾಡಿ.",
  "Enter the 6-digit verification code generated by your app below.": "ನಿಮ್ಮ ಅಪ್ಲಿಕೇಶನ್‌ನಿಂದ ಜನರೇಟ್ ಮಾಡಲಾದ 6-ಅಂಕಿಯ ಪರಿಶೀಲನಾ ಕೋಡ್ ಅನ್ನು ಕೆಳಗೆ ನಮೂದಿಸಿ.",
  "Verify & Enable": "ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಸಕ್ರಿಯಗೊಳಿಸಿ",
  "Cancel Setup": "ಸೆಟಪ್ ರದ್ದುಗೊಳಿಸಿ",
  "MFA is Active & Protecting Your Account": "MFA ಸಕ್ರಿಯವಾಗಿದೆ ಮತ್ತು ನಿಮ್ಮ ಖಾತೆಯನ್ನು ರಕ್ಷಿಸುತ್ತಿದೆ",
  "Your session is protected by standard hardware-based TOTP encryption.": "ನಿಮ್ಮ ಸೆಷನ್ ಅನ್ನು ಪ್ರಮಾಣಿತ ಹಾರ್ಡ್‌ವೇರ್-ಆಧಾರಿತ TOTP ಎನ್‌ಕ್ರಿಪ್ಶನ್‌ನಿಂದ ರಕ್ಷಿಸಲಾಗಿದೆ.",

  // Login Page
  "Authorized Sign In": "ಅಧಿಕೃತ ಸೈನ್ ಇನ್",
  "Access is restricted to verified police personnel only.": "ಪ್ರವೇಶವನ್ನು ಪರಿಶೀಲಿಸಿದ ಪೊಲೀಸ್ ಸಿಬ್ಬಂದಿಗೆ ಮಾತ್ರ ಸೀಮಿತಗೊಳಿಸಲಾಗಿದೆ.",
  "Official Email ID": "ಅಧಿಕೃತ ಇಮೇಲ್ ಐಡಿ",
  "Security Password": "ಭದ್ರತಾ ಪಾಸ್‌ವರ್ಡ್",
  "Verify & Continue": "ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಮುಂದುವರಿಯಿರಿ",
  "WARNING: Unauthorized access to this system is a crime under the IT Act, 2000 and Indian Penal Code.": "ಎಚ್ಚರಿಕೆ: ಈ ಸಿಸ್ಟಮ್‌ಗೆ ಅನಧಿಕೃತ ಪ್ರವೇಶವು ಐಟಿ ಕಾಯ್ದೆ, 2000 ಮತ್ತು ಭಾರತೀಯ ದಂಡ ಸಂಹಿತೆಯ ಅಡಿಯಲ್ಲಿ ಅಪರಾಧವಾಗಿದೆ.",
  "Two-Factor Challenge": "ದ್ವಿ-ಅಂಶದ ಸವಾಲು",
  "Enter the 6-digit verification code from your authenticator app.": "ನಿಮ್ಮ ಅಥೆಂಟಿಕೇಟರ್ ಅಪ್ಲಿಕೇಶನ್‌ನಿಂದ 6-ಅಂಕಿಯ ಪರಿಶೀಲನಾ ಕೋಡ್ ಅನ್ನು ನಮೂದಿಸಿ.",
  "Verification Code": "ಪರಿಶೀಲನಾ ಕೋಡ್",
  "Verify & Access": "ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಪ್ರವೇಶಿಸಿ",
  "Cancel & Go Back": "ರದ್ದುಗೊಳಿಸಿ ಮತ್ತು ಹಿಂತಿರುಗಿ",
  "OFFICIAL INSTRUCTIONS": "ಅಧಿಕೃತ ಸೂಚನೆಗಳು",
  "Secure Login Portal": "ಸುರಕ್ಷಿತ ಲಾಗಿನ್ ಪೋರ್ಟಲ್",
  "\"ಸೇವಾ ಧರ್ಮ\" • SERVICE IS DUTY": "\"ಸೇವಾ ಧರ್ಮ\" • ಸೇವೆ ಅತ್ಯುನ್ನತ ಕರ್ತವ್ಯ",
  "System Auditing": "ಸಿಸ್ಟಮ್ ಆಡಿಟಿಂಗ್",
  "All login attempts, successful or failed, are logged with IP addresses, timestamps, and device fingerprints for security audit trails.": "ಎಲ್ಲಾ ಲಾಗಿನ್ ಪ್ರಯತ್ನಗಳನ್ನು (ಯಶಸ್ವಿ ಅಥವಾ ವಿಫಲ) ಐಪಿ ವಿಳಾಸಗಳು, ಟೈಮ್‌ಸ್ಟ್ಯಾಂಪ್‌ಗಳು ಮತ್ತು ಭದ್ರತಾ ಆಡಿಟ್ ಟ್ರೇಲ್‌ಗಳಿಗಾಗಿ ಸಾಧನದ ಫಿಂಗರ್‌ಪ್ರಿಂಟ್‌ಗಳೊಂದಿಗೆ ಲಾಗ್ ಮಾಡಲಾಗುತ್ತದೆ.",
  "Emergency Contact": "ತುರ್ತು ಸಂಪರ್ಕ",
  "For technical support or account lockouts, contact the KSP IT Cell or call the emergency helpline at 112.": "ತಾಂತ್ರಿಕ ಬೆಂಬಲ ಅಥವಾ ಖಾತೆ ಲಾಕ್‌ಔಟ್‌ಗಾಗಿ, KSP ಐಟಿ ಸೆಲ್ ಅನ್ನು ಸಂಪರ್ಕಿಸಿ ಅಥವಾ ತುರ್ತು ಸಹಾಯವಾಣಿ 112 ಕ್ಕೆ ಕರೆ ಮಾಡಿ.",
  "Home": "ಮುಖಪುಟ",
  "Privacy Policy": "ಗೌಪ್ಯತಾ ನೀತಿ",
  "Terms & Conditions": "ನಿಯಮಗಳು ಮತ್ತು ನಿಬಂಧನೆಗಳು",
  "Hyperlinking Policy": "ಹೈಪರ್‌ಲಿಂಕಿಂಗ್ ನೀತಿ",
  "Disclaimer": "ಹಕ್ಕುತ್ಯಾಗ",
  "Help": "ಸಹಾಯ",
  "Copyright © 2026 Karnataka State Police. All Rights Reserved.": "ಕೃತಿಸ್ವಾಮ್ಯ © 2026 ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್. ಎಲ್ಲಾ ಹಕ್ಕುಗಳನ್ನು ಕಾಯ್ದಿರಿಸಲಾಗಿದೆ.",
  "Designed & Developed by KSP IT Cell / National Informatics Centre (NIC).": "ವಿನ್ಯಾಸ ಮತ್ತು ಅಭಿವೃದ್ಧಿಪಡಿಸಿದವರು KSP ಐಟಿ ಸೆಲ್ / ರಾಷ್ಟ್ರೀಯ ಮಾಹಿತಿ ಕೇಂದ್ರ (NIC)."
};

interface LanguageContextType {
  locale: 'en' | 'kn';
  t: (key: string) => string;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Extend Window interface for Google Translate
declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
  }
}

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [locale, setLocale] = useState<'en' | 'kn'>(() => {
    return (localStorage.getItem('pref-lang') as 'en' | 'kn') || 'en';
  });

  useEffect(() => {
    // Save preference
    localStorage.setItem('pref-lang', locale);

    // Update document title dynamically
    if (locale === 'kn') {
      if (!document.title.includes('ಕರ್ನಾಟಕ')) {
        document.title = "KSP - ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್ ಸುರಕ್ಷಿತ ಪೋರ್ಟಲ್";
      }
    } else {
      document.title = "KSP - Karnataka State Police Secure Portal";
    }

    // Google Translate fallback trigger
    const triggerGoogleTranslate = (langCode: string) => {
      const select = document.querySelector('select.goog-te-combo') as HTMLSelectElement;
      if (select) {
        select.value = langCode;
        select.dispatchEvent(new Event('change'));
      } else {
        setTimeout(() => triggerGoogleTranslate(langCode), 150);
      }
    };

    triggerGoogleTranslate(locale === 'kn' ? 'kn' : '');
  }, [locale]);

  // Load Google Translate Script in background on mount
  useEffect(() => {
    window.googleTranslateElementInit = () => {
      // @ts-ignore
      new window.google.translate.TranslateElement({
        pageLanguage: 'en',
        includedLanguages: 'kn',
        // @ts-ignore
        layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE
      }, 'google_translate_element');
    };

    const el = document.createElement('div');
    el.id = 'google_translate_element';
    el.style.position = 'absolute';
    el.style.top = '-9999px';
    el.style.left = '-9999px';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.overflow = 'hidden';
    document.body.appendChild(el);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    document.head.appendChild(script);

    return () => {
      document.body.removeChild(el);
      document.head.removeChild(script);
    };
  }, []);

  const t = (key: string): string => {
    if (locale === 'kn' && dictionary[key]) {
      return dictionary[key];
    }
    return key;
  };

  const toggleLanguage = () => {
    setLocale((prev) => (prev === 'kn' ? 'en' : 'kn'));
  };

  return (
    <LanguageContext.Provider value={{ locale, t, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
