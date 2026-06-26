export const getFlagUrl = (country: string) => {
  const codes: Record<string, string> = {
    'India': 'in',
    'Afghanistan': 'af',
    'Australia': 'au',
    'England': 'gb',
    'New Zealand': 'nz',
    'South Africa': 'za',
    'Sri Lanka': 'lk',
    'Bangladesh': 'bd',
    'Pakistan': 'pk',
    'Ireland': 'ie',
    'Zimbabwe': 'zw',
    'Netherlands': 'nl',
    'USA': 'us',
    'Canada': 'ca',
    'Namibia': 'na',
    'Scotland': 'gb-sct',
    'Nepal': 'np',
    'Oman': 'om',
    'UAE': 'ae',
  };
  
  if (country === 'West Indies') {
    return 'https://upload.wikimedia.org/wikipedia/en/9/9b/Cricket_West_Indies_logo.svg';
  }
  
  const code = codes[country];
  return code ? `https://flagcdn.com/w80/${code}.png` : `https://api.dicebear.com/7.x/initials/svg?seed=${country}`;
};
