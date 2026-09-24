// Site settings. Everything here is public (it ships with the website).
window.FT_CONFIG = {
  // Firebase project used to sync edits (see README "Editing & sync setup").
  // These values are designed to be public; the passphrase is NOT here — it is the
  // password of the editor account in Firebase Authentication.
  firebase: {
    apiKey: 'AIzaSyC0gHie0hoHmUg1o3B-_CQ0t6lWPlzfsTM',
    projectId: 'family-tree-81678',
    editorEmail: 'editor@azandowanu.family',
  },

  // "Suggest a change" → WhatsApp (international format, no + or leading 0).
  whatsapp: '2348080825007',

  // Person shown first to new visitors (Azandowanu).
  startPerson: '157507',

  // Privacy: people with no death date who were born < 100 years ago count as
  // living. Their birth YEAR is never published; day + month show as a birthday.
  privacy: { keepLivingBirthYears: false },
};
