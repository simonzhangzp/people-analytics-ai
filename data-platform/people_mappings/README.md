# people_v2 source-to-canonical mappings (GATE 1)

Pins: Frappe HR v16.15.0, ERPNext v16.0.0, Greenhouse Harvest v3.

v1 mappings that targeted `people_silver_*` live in `archive_v1/`.

Every §5 column is listed in `canonical_model.yml` and mapped in a sibling YAML. Provenance must not be `UNJUSTIFIED`.

```text
python people_mappings/check_coverage.py
```

`emit_v2_mappings.py` regenerates the YAML from the GATE 1 spec. Review the YAML, not the emitter, at GATE 1.
