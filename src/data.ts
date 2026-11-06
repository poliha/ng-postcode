// Reference data for the mock. Everything here is either published by NIPOST or public knowledge;
// anything the mock has to make up is generated in synth.ts and labelled as mock data.

/**
 * The 20 real, active postcodes NIPOST publishes on its Lookup levels page (its "sample
 * postcodes", which resolve under a live key), plus the worked example from its quickstart
 * (EK-01-A03-FK-01). The 20 cover 10 states; the example adds EK, the 11th.
 */
export const TEST_POSTCODES: readonly string[] = [
  'EK-01-A03-FK-01',
  'AK-11-I61-ZF-12',
  'AK-11-H40-WD-11',
  'BA-02-M67-BL-69',
  'BA-02-E99-NE-30',
  'EB-13-G95-FR-90',
  'EB-13-I97-AB-30',
  'EN-05-V19-CD-22',
  'EN-05-V19-FT-20',
  'FC-03-B06-AG-12',
  'FC-02-B19-RT-30',
  'JI-24-O18-JP-23',
  'JI-24-N11-VM-58',
  'KN-31-F82-WJ-80',
  'KN-31-D78-IQ-38',
  'LA-11-W06-TC-10',
  'LA-11-U34-ZR-63',
  'NI-09-J67-QC-65',
  'NI-09-A75-DA-10',
  'OG-14-T18-BN-16',
  'OG-14-M82-QA-09',
]

/**
 * NIPOST's sandbox postcodes, the only codes a sandbox key (`nipost_test_…`) resolves. NIPOST
 * describes each only as "Public building (FCT)", so the mock treats them like the sample
 * postcodes: real state, everything below it mock data.
 */
export const SANDBOX_POSTCODES: readonly string[] = [
  'FC-01-A01-KP-27',
  'FC-01-A01-LR-01',
  'FC-01-A01-MH-01',
  'FC-01-A01-MV-01',
  'FC-01-A01-MW-01',
]

export type Zone = 'NORTH CENTRAL' | 'NORTH EAST' | 'NORTH WEST' | 'SOUTH EAST' | 'SOUTH SOUTH' | 'SOUTH WEST'

/**
 * NIPOST's 37 state codes and names, as `/v1/reference/states` returns them (read with a test key on
 * 2026-11-06), with the geopolitical zone and a rough centre point as [lng, lat]. Lookups give the
 * name in capitals (`EKITI` in the quickstart); the reference endpoint gives it as written here.
 */
export const KNOWN_STATES: Readonly<Record<string, { name: string, zone: Zone, centre: [number, number] }>> = {
  AB: { name: 'Abia', zone: 'SOUTH EAST', centre: [7.5, 5.45] },
  AD: { name: 'Adamawa', zone: 'NORTH EAST', centre: [12.4, 9.3] },
  AK: { name: 'Akwa Ibom', zone: 'SOUTH SOUTH', centre: [7.85, 5.0] },
  AN: { name: 'Anambra', zone: 'SOUTH EAST', centre: [6.95, 6.2] },
  BA: { name: 'Bauchi', zone: 'NORTH EAST', centre: [9.95, 10.5] },
  BE: { name: 'Benue', zone: 'NORTH CENTRAL', centre: [8.75, 7.35] },
  BR: { name: 'Borno', zone: 'NORTH EAST', centre: [13.15, 11.85] },
  BY: { name: 'Bayelsa', zone: 'SOUTH SOUTH', centre: [6.1, 4.75] },
  CR: { name: 'Cross River', zone: 'SOUTH SOUTH', centre: [8.6, 5.85] },
  DE: { name: 'Delta', zone: 'SOUTH SOUTH', centre: [6.0, 5.55] },
  EB: { name: 'Ebonyi', zone: 'SOUTH EAST', centre: [8.05, 6.25] },
  ED: { name: 'Edo', zone: 'SOUTH SOUTH', centre: [6.0, 6.6] },
  EK: { name: 'Ekiti', zone: 'SOUTH WEST', centre: [5.3, 7.7] },
  EN: { name: 'Enugu', zone: 'SOUTH EAST', centre: [7.4, 6.55] },
  FC: { name: 'Federal Capital Territory', zone: 'NORTH CENTRAL', centre: [7.2, 8.85] },
  GM: { name: 'Gombe', zone: 'NORTH EAST', centre: [11.15, 10.35] },
  IM: { name: 'Imo', zone: 'SOUTH EAST', centre: [7.05, 5.5] },
  JI: { name: 'Jigawa', zone: 'NORTH WEST', centre: [9.55, 12.2] },
  KD: { name: 'Kaduna', zone: 'NORTH WEST', centre: [7.7, 10.4] },
  KE: { name: 'Kebbi', zone: 'NORTH WEST', centre: [4.2, 11.6] },
  KG: { name: 'Kogi', zone: 'NORTH CENTRAL', centre: [6.6, 7.75] },
  KN: { name: 'Kano', zone: 'NORTH WEST', centre: [8.5, 11.8] },
  KT: { name: 'Katsina', zone: 'NORTH WEST', centre: [7.6, 12.3] },
  KW: { name: 'Kwara', zone: 'NORTH CENTRAL', centre: [4.6, 8.95] },
  LA: { name: 'Lagos', zone: 'SOUTH WEST', centre: [3.6, 6.5] },
  NA: { name: 'Nasarawa', zone: 'NORTH CENTRAL', centre: [8.3, 8.5] },
  NI: { name: 'Niger', zone: 'NORTH CENTRAL', centre: [5.6, 9.95] },
  OG: { name: 'Ogun', zone: 'SOUTH WEST', centre: [3.45, 7.0] },
  ON: { name: 'Ondo', zone: 'SOUTH WEST', centre: [5.05, 7.0] },
  OS: { name: 'Osun', zone: 'SOUTH WEST', centre: [4.55, 7.55] },
  OY: { name: 'Oyo', zone: 'SOUTH WEST', centre: [3.6, 8.15] },
  PL: { name: 'Plateau', zone: 'NORTH CENTRAL', centre: [9.5, 9.2] },
  RI: { name: 'Rivers', zone: 'SOUTH SOUTH', centre: [6.9, 4.85] },
  SK: { name: 'Sokoto', zone: 'NORTH WEST', centre: [5.25, 13.05] },
  TA: { name: 'Taraba', zone: 'NORTH EAST', centre: [10.8, 8.0] },
  YB: { name: 'Yobe', zone: 'NORTH EAST', centre: [11.5, 12.3] },
  ZA: { name: 'Zamfara', zone: 'NORTH WEST', centre: [6.2, 12.15] },
}

/** LGA names confirmed by NIPOST's docs, keyed by `STATE-LGA`. */
export const KNOWN_LGAS: Readonly<Record<string, string>> = {
  'EK-01': 'ADO EKITI',
}

/** Rough bounding box of Nigeria, used to decide whether reverse geocoding finds anything. */
export const NIGERIA_BBOX = { minLng: 2.6, maxLng: 14.7, minLat: 4.2, maxLat: 13.9 } as const
