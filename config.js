// Site settings. Everything here is public (it ships with the website).
window.FT_CONFIG = {
  // Google Apps Script web-app URL (see README "Backend setup").
  // It stores the tree, checks the editor passphrase and receives suggestions.
  backend: { url: '' },

  // "Suggest a change" → WhatsApp (international format, no + or leading 0).
  whatsapp: '2348080825007',

  // Person shown first to new visitors (Azandowanu).
  startPerson: '157507',

  // Privacy: people with no death date who were born < 100 years ago count as
  // living. Their birth YEAR is never published; day + month show as a birthday.
  privacy: { keepLivingBirthYears: false },
};
