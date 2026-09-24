// Site settings. Everything here is public (it ships with the website).
window.FT_CONFIG = {
  // GitHub repo that hosts the site — the editor saves changes here.
  github: { owner: 'SSSeyon', repo: 'familytree', branch: 'main' },

  // "Suggest a change" → WhatsApp (international format, no + or leading 0).
  whatsapp: '2349033263087',

  // "Suggest a change" → Google Form. See README "Google Form setup".
  // Leave formUrl empty to hide the Google Form option.
  googleForm: {
    formUrl: '', // e.g. https://docs.google.com/forms/d/e/1FAIpQL.../formResponse
    fields: {
      person: '',   // e.g. entry.123456789
      personId: '',
      type: '',
      message: '',
      name: '',
      contact: '',
    },
  },

  // Privacy: people with no death date who were born < 100 years ago count as
  // living. Their birth YEAR is never published; day + month show as a birthday.
  privacy: { keepLivingBirthYears: false },
};
