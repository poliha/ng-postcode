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
 * The 11 state codes confirmed by NIPOST's docs (each appears in a published postcode), with the
 * state name, geopolitical zone and a rough centre point as [lng, lat]. Other two-letter codes are
 * well-formed but unconfirmed, so the mock answers for them with clearly labelled placeholders.
 * NIPOST has 37 states; the mock knows only these.
 */
export const KNOWN_STATES: Readonly<Record<string, { name: string, zone: Zone, centre: [number, number] }>> = {
  AK: { name: 'AKWA IBOM', zone: 'SOUTH SOUTH', centre: [7.85, 5.0] },
  BA: { name: 'BAUCHI', zone: 'NORTH EAST', centre: [9.95, 10.5] },
  EB: { name: 'EBONYI', zone: 'SOUTH EAST', centre: [8.05, 6.25] },
  EK: { name: 'EKITI', zone: 'SOUTH WEST', centre: [5.3, 7.7] },
  EN: { name: 'ENUGU', zone: 'SOUTH EAST', centre: [7.4, 6.55] },
  FC: { name: 'FCT', zone: 'NORTH CENTRAL', centre: [7.2, 8.85] },
  JI: { name: 'JIGAWA', zone: 'NORTH WEST', centre: [9.55, 12.2] },
  KN: { name: 'KANO', zone: 'NORTH WEST', centre: [8.5, 11.8] },
  LA: { name: 'LAGOS', zone: 'SOUTH WEST', centre: [3.6, 6.5] },
  NI: { name: 'NIGER', zone: 'NORTH CENTRAL', centre: [5.6, 9.95] },
  OG: { name: 'OGUN', zone: 'SOUTH WEST', centre: [3.45, 7.0] },
}

/** LGA names confirmed by NIPOST's docs, keyed by `STATE-LGA`. */
export const KNOWN_LGAS: Readonly<Record<string, string>> = {
  'EK-01': 'ADO EKITI',
}

/** Rough bounding box of Nigeria, used to decide whether reverse geocoding finds anything. */
export const NIGERIA_BBOX = { minLng: 2.6, maxLng: 14.7, minLat: 4.2, maxLat: 13.9 } as const
