# Changelog

## 0.2.0 (2026-10-06)

Follows NIPOST's documentation changes found on 2026-10-06.

### Added

- Reference endpoints: `GET /v1/reference/states`, `/lgas?state=`, `/districts?state=&lga=` and
  `/areas?state=&lga=&district=`, in the mock, the MSW handlers, the docs page and the client
  (`states()`, `lgas(state)`, `districts({ state, lga })`, `areas({ state, lga, district })`).
  `states` lists the 11 states the mock knows, of NIPOST's 37. LGAs are named `MOCK LGA NN`;
  districts and areas are generated codes. They are free and take keys like the other endpoints.
- Sandbox keys: a key starting `nipost_test_` resolves only NIPOST's five sandbox postcodes
  (`FC-01-A01-KP-27`, `FC-01-A01-LR-01`, `FC-01-A01-MH-01`, `FC-01-A01-MV-01`,
  `FC-01-A01-MW-01`). Every other code, the 20 sample postcodes included, comes back
  `valid: false`. Sandbox lookups use no credits and are never capped. The docs page offers
  `nipost_test_mock` in its key dropdown.
- Live keys: under a key starting `nipost_live_`, the five sandbox postcodes come back
  `valid: false`, since NIPOST says they resolve only under a test key. Their L3 building use reads
  `public`, as NIPOST describes them as public buildings.
- `SANDBOX_POSTCODES` export, and `NamedCode`, `StatesResponse`, `LgasResponse`,
  `DistrictsResponse` and `AreasResponse` types.

### Changed

- `mock_no_scope` now returns `403 level_not_granted`, the code in NIPOST's docs, in place of the
  guessed `insufficient_scope`.
- The vendored OpenAPI spec is refreshed (fetched 2026-10-06). It adds the reference endpoints and
  the `NamedCode` schema and drops the localhost servers. The contract test now covers the
  reference endpoints and sandbox lookups.
- README: the 20 sample postcodes cover 10 states, with the quickstart's example adding the 11th
  (EK); NIPOST now calls them sample postcodes. The table of differences between NIPOST's docs and
  its API is updated: the keyless-access and lookup-levels rows are resolved, and the postcode
  length row now notes that NIPOST's landing page and FAQ say 11 characters.
