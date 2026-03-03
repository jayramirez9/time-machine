/**
 * Shared Era Data
 *
 * Single source of truth for technology introduction dates.
 * Used by elevenlabs-fetch.js (prompt exclusions) and era-audit.js (attribution auditing).
 *
 * Each entry: [introductionYear, promptExclusionText, auditKeywords[]]
 *   - introductionYear: year the technology was first publicly demonstrated or deployed
 *   - promptExclusionText: human-readable phrase for ElevenLabs prompt exclusions
 *   - auditKeywords: lowercase substrings to flag in Freesound attributions
 *
 * Filter convention: exclude when introductionYear >= era.year
 * (debut year = experimental/rare, not yet part of the soundscape)
 */

export const ANACHRONISMS = [
  // Steam & industrial revolution
  [1712, 'steam engines',                          ['steam engine']],
  [1807, 'steamboats or steam whistles',            ['steamboat', 'steam whistle']],
  [1830, 'steam railways or locomotives',           ['steam train', 'locomotive', 'railway engine']],
  [1844, 'telegraph clicking',                      ['telegraph']],

  // Late 19th century
  [1876, 'telephones or telephone bells',           ['telephone', 'phone ring']],
  [1877, 'phonographs or recorded music',           ['phonograph', 'gramophone', 'record player']],
  [1879, 'electric lights or electric humming',     ['electric light', 'electric hum', 'electric buzz']],
  [1886, 'automobiles or internal combustion engines', ['automobile', 'internal combustion', 'gasoline engine']],
  [1888, 'electric streetcars or trolleys',         ['trolley', 'streetcar', 'tram', 'electric rail']],
  [1895, 'diesel engines',                          ['diesel']],
  [1897, 'subway trains',                           ['subway', 'metro train', 'underground train']],

  // Early 20th century
  [1903, 'airplanes or powered flight',             ['airplane', 'aeroplane', 'aircraft', 'propeller plane']],
  [1908, 'automobile horns or car traffic',         ['car horn', 'honk', 'traffic jam', 'car traffic']],
  [1912, 'electric fans',                           ['electric fan']],
  [1920, 'commercial radio broadcasts',             ['radio broadcast', 'radio music']],
  [1921, 'police or ambulance sirens',              ['siren', 'police siren', 'ambulance']],
  [1927, 'movie soundtracks or talkies',            ['movie sound', 'cinema', 'talkie']],
  [1928, 'electric refrigerator humming',           ['refrigerator', 'fridge hum']],
  [1935, 'parking meters or traffic signal clicks', ['parking meter', 'traffic signal', 'traffic light']],

  // Mid 20th century
  [1939, 'television broadcasts',                   ['television', 'tv broadcast']],
  [1942, 'jet aircraft',                            ['jet engine', 'jet aircraft', 'jet plane']],
  [1945, 'helicopters',                             ['helicopter', 'chopper', 'rotor']],
  [1947, 'window air conditioning units',           ['air condition', 'ac unit', 'hvac', 'window unit']],
  [1950, 'rock and roll music',                     ['rock music', 'electric guitar', 'rock and roll']],
  [1956, 'interstate highway traffic',              ['highway', 'freeway', 'interstate']],
  [1958, 'commercial jet airliners overhead',       ['jet airliner', 'commercial jet', 'passenger jet']],

  // Late 20th century
  [1963, 'electronic synthesizer sounds',           ['synthesizer', 'synth', 'electronic music']],
  [1969, 'jumbo jet aircraft',                      ['jumbo jet', '747', 'wide-body']],
  [1975, 'personal computer beeps or digital sounds', ['computer beep', 'digital sound', 'pc speaker']],
  [1979, 'portable cassette players',               ['walkman', 'portable cassette', 'boombox']],
  [1983, 'cell phones or digital ringtones',        ['cell phone', 'mobile phone', 'ringtone', 'cellular']],
  [1990, 'internet dial-up modem sounds',           ['modem', 'dial-up', 'dial up']],

  // 21st century
  [2001, 'drone aircraft buzzing',                  ['drone', 'quadcopter', 'uav']],
  [2010, 'electric vehicle whine',                  ['electric vehicle', 'ev whine', 'tesla']],
  [2017, 'electric scooter sounds',                 ['e-scooter', 'electric scooter', 'lime scooter']],
];

/**
 * Get exclusion text for an ElevenLabs prompt.
 * Returns a string like "No automobiles, jet aircraft, ... Only sounds that existed in 1884."
 * Returns empty string if no exclusions apply (very modern era).
 */
export function getExclusionText(year) {
  const excluded = ANACHRONISMS
    .filter(([introYear]) => introYear >= year)
    .map(([, text]) => text);
  if (!excluded.length) return '';
  return `No ${excluded.join(', ')}. Only sounds that existed in ${year}.`;
}

/**
 * Get audit patterns for era-audit.js.
 * Returns an array of { pattern: RegExp, flag: string, introYear: number }
 */
export function getAuditPatterns(year) {
  return ANACHRONISMS
    .filter(([introYear]) => introYear >= year)
    .flatMap(([introYear, desc, keywords]) =>
      keywords.map(kw => ({
        pattern: new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
        flag: `${desc} (introduced ${introYear})`,
        introYear,
      }))
    );
}
