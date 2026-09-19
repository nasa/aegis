## Feedback for the GIS team

Tracked while importing this delivery and wiring these layers into the active AEGIS map. This section is the list to send back to the GIS team, including outstanding problems with the delivery and open questions for the GIS/product teams.

### Delivery contents as received

```text
AEGIS_MS3_MP026_GIS_Data_20260812
├── 00_GIS_Files
│   ├── 00_Vector
│   │   ├── 00_Shapefiles      (shapefile version of each dataset)
│   │   └── 01_GeoJSON
│   │        GeoContacts.geojson
│   │        GeoContacts_BuildPolygons8.geojson
│   │        LinearFeatures.geojson
│   │        LocationFeatures.geojson
│   │        map_boundary.geojson
│   │        MP026_craters_AM-072736.geojson
│   │        MS3_A03MP026_Nomenclature_v2.geojson
│   │        MS3_boulders_reviewed_bwd.geojson
│   │        PSR_overlays.geojson
│   │        SurfaceFeatures.geojson
│   └── 02_Tables
│        export_log_20260812_132444.txt
│        fgdc_report_summary.pdf
└── 01_Styles                  (one .lyrx per dataset, ten total)
```

### Problems with delivery

### 1. The GeoJSON copies are not needed

Deliver shapefiles only. The shapefile carries its source CRS in the `.prj`, which is what the AEGIS importer needs; the paired GeoJSON exports add no information and cost review time. Every projected GeoJSON in this delivery also carries meter coordinates that must not be read as longitude/latitude, and two of them are unusable outright (`LocationFeatures.geojson` is empty, `PSR_overlays.geojson` is truncated).

### 2. Label-property naming is inconsistent across datasets

Each dataset puts its human-readable label in a differently named property:

| Dataset (AEGIS product name)                    | Property holding the label |
| ----------------------------------------------- | -------------------------- |
| Nomenclature (`MS3_A03MP026_Nomenclature_v2`)   | `label`                    |
| Geomorphic Units (`GeoContacts_BuildPolygons8`) | `Unit`                     |
| Geomorphic Contacts (`GeoContacts`)             | `TYPE` (all caps)          |
| Geomorphic Linear Features (`LinearFeatures`)   | `TYPE` (all caps)          |
| Geomorphic Surface Features (`SurfaceFeatures`) | `TYPE` (all caps)          |
| Craters (`MP026_craters_AM-072736`)             | none; only `TYPE`          |
| Boulders (`MS3_boulders_reviewed_bwd`)          | none; only `TYPE`          |

Craters and boulders are the worst cases and are covered in detail in items 8 and 10: neither has a label property, and in both the only text-bearing field is a class name shared by every feature or nearly every feature. Item 11 is the concrete ask for those two datasets.

Because of this, AEGIS falls back through a fixed chain of property names to find a label, ending `… name → NAME → Unit → TYPE`. That chain has had to grow once per spelling this drop invented, it is hardcoded with no per-sublayer override (`MapSublayerStyle` has no label-property field), and it will break the moment a future delivery uses `Label`, `Name`, or `Class`, for example. It is also lossy: because the chain is ordered, a dataset carrying two of these properties silently labels from whichever appears first, not from whichever the GIS team meant. **Need: settle on one label property name, spelled identically in every dataset, for all future deliveries.** `label` (lowercase) is the preferred name because the nomenclature dataset already uses it. Keep the domain-specific attributes (`Unit`, `TYPE`, `SIZE`, `CONFIDENCE`) as well — they are useful for styling and filtering — but add the one agreed label property alongside them.

### 3. `Geomorphic_Units` has a dead `Type` property

`GeoContacts_BuildPolygons8` carries a valid `Unit` value per feature, but also a `Type` property whose values are all `null` or the literal string `"<null>"`. The literal `"<null>"` string is worse than an absent property, because consuming code has to special-case it. Either populate `Type` with meaningful values or drop the field from the export.

### 4. `MS3_Geomorphic_Contacts` duplicates the unit boundaries

A programmatic comparison of the authoritative shapefiles confirmed that all 43 `GeoContacts` lines duplicate the complete boundary network of the 36 `GeoContacts_BuildPolygons8` unit polygons. The linework is coincident within 0.1 mm, and the paired GeoJSON files produce the same result. The only additional information is the `TYPE` confidence class; all 43 `COMMENT` values are null.

**Omit `GeoContacts` from future AEGIS deliveries.** The unit polygons already provide the same boundaries, so delivering and rendering both datasets duplicates data without adding sufficient planning value.

`GeoContacts_BuildPolygons8` is also not a descriptive dataset name; it exposes an apparent polygon-building workflow rather than identifying the delivered content. Rename it to `Geomorphic_Units` or another stable, content-based name in future deliveries.

### 5. `Geomorphic_SurfaceFeatures` is likely out of scope

Beyond using `TYPE` for its label, this dataset sits well outside the EVA operating area and consists only of unlabeled areas. Unless there is a planning reason to carry it, it can be dropped from future data deliveries.

### 6. `map_boundary` is not needed

AEGIS does not use it. It is a single-polygon authoring/reference extent describing the source map's own footprint, not a mission product, and it carries no information a planner acts on. Drop it from future deliveries.

### 7. The PSR datasets are duplicated and partly invalid

- `RasterT_Int_psr2` and `RasterT_Int_psr2_1` are byte-for-byte duplicates.
- PSR feature `Id=100` has a self-intersecting ring.
- `PSR_overlays.geojson` is truncated.

### 8. `MS3_boulders_reviewed_bwd` has no label, and `TYPE` is not a type

This is the same problem as item 2, in its most extreme form. The dataset carries `FID`, `TYPE`, `COMMENT`, `SIZE`, and `CONFIDENCE` and nothing else, and the only text-bearing field is a class name:

- `TYPE` is the literal string `boulder` on all 48 features. The delivered `MS3_boulders_reviewed_bwd.lyrx` carries a label class bound to the Arcade expression `$feature.TYPE`; enabled, it would draw the word "boulder" 48 times across a 1.2 km by 2.2 km area. That is the layer name repeated once per feature, not a label. Layer labelling is in fact switched off in that `.lyrx` — as it is in every `.lyrx` in this delivery except nomenclature, the one dataset with a real label field. AEGIS defaults vector labels on and reads `TYPE` as a last-resort label, so on redelivery this layer must ship with labels disabled until it carries a real one.
- `COMMENT` holds the LROC image IDs each boulder was identified in, for example `M1157658572LR, M180857163RC, M178498275LC`. That is provenance suited to a tooltip, not a label.
- `FID` is the shapefile row index and is not stable across redeliveries.

We need the one agreed label property from item 2, populated with a real per-boulder name where one exists. Do not fill a label field with a class name. Also supply a stable per-feature `id` that survives redelivery, as the nomenclature dataset already does.

Combined with item 9, there is nothing in the dataset that distinguishes one boulder from another in a way AEGIS can present. The layer would be 48 identical unlabelled dots that a planner cannot identify, grade, or filter. It will be imported once a label property and documented `SIZE`/`CONFIDENCE` semantics are delivered.

### 9. The boulder `SIZE` and `CONFIDENCE` attributes are undocumented

`SIZE` and `CONFIDENCE` are the only per-feature discriminators in the boulder dataset and are the attributes a planner would actually act on, but neither is defined anywhere in the delivery. Every `attrdef` in `MS3_boulders_reviewed_bwd.shp.xml` is empty except the auto-generated `FID` and `Shape` entries, and the `.lyrx` renderer does not use either field.

- `SIZE` takes the values 0, 1, 2, 3, and 6. **Need:** the unit. Metres of diameter, or an ordinal class? Either reading leaves `SIZE = 0` (2 features) ambiguous.
- `CONFIDENCE` takes 1 (7 features), 2 (24 features), and 3 (17 features). **Need:** which end of the scale is most confident, and what each level means.

Until both are documented, AEGIS could only draw every boulder with the same symbol and could not grade or filter them, which removes the planning value of a boulder layer. This is the second half of the reason the layer is omitted for MS3 (see item 8).

Separately, **need:** an expansion of `bwd` in the dataset name, or a rename. The delivery gives no key for it.

### 10. `MP026_craters_AM-072736` has four undocumented attributes, and none of them is a label

Craters are imported for MS3 because the geometry and the two `TYPE` classes are usable, but the rest of the dataset has the same problems as boulders. It carries `FID`, `OBJECTID`, `TYPE`, `COMMENT`, `Degredatio`, `RimStage`, `EjectaStat`, `InteriorSt`, and `SHAPE_Leng`. The four middle fields are the geological content of the layer, and all four are undocumented in exactly the way item 9 describes: every `attrdef` in `MP026_craters_AM-072736.shp.xml` is empty except the auto-generated `FID` and `Shape` entries, and §5 of `fgdc_report_summary.pdf` lists attribute names and storage types with no definitions for any dataset in the delivery. `MP026_craters_AM-072736.lyrx` does not reference any of the four — it renders and labels from `TYPE` alone.

| Attribute    | Storage       | Distinct values (199 features) | Condition                                                              |
| ------------ | ------------- | -----------------------------: | ---------------------------------------------------------------------- |
| `Degredatio` | `float:19.15` |                              4 | Ordinal 1-4, undocumented, field name truncated and misspelled         |
| `RimStage`   | `str:254`     |                             32 | Free text; 21 values occur once; typos and case/wording variants       |
| `EjectaStat` | `str:254`     |                              8 | Free text; 192 of 199 are `none`; the other 7 are one-off notes        |
| `InteriorSt` | `str:254`     |                             35 | Free text; 20 values occur once; the most common value contains a typo |

- **`Degredatio`** takes 1 (115 features), 2 (61), 3 (22), and 4 (1). It is the one attribute here that a planner could act on, and it is the most damaged. The name is both truncated to the DBF 10-character limit and misspelled ("Degredation"), so the delivery contains no record of what the field is actually called. The scale's direction is undocumented; it can be inferred by correlating it against the free-text fields (113 of the 115 stage-1 features are `rimless`, and the single stage-4 feature is `sharp`, so 1 is most degraded and 4 is freshest), but inferring a stage scale from prose is not an acceptable basis for styling a mission layer. **Need:** the field's real name, its definition, and the meaning of each of the four stages. Deliver it as an integer with a published coded domain, not as a 15-decimal float.
- **`RimStage`**, **`EjectaStat`**, and **`InteriorSt`** are field notes, not attributes. Same observation, many spellings: `modified` and `Modified`; `slightly elevated`, `slightly elevated rim`, and `slightly raised rim`; `relatively unmodified`, `unmodified rim`, and `pristine, unmodified`. Order variants split the same pair of observations across `cratered, infilled`, `infilled, cratered`, and `cratered, infilling`. Typos are carried in the data, including the single most common `InteriorSt` value: `infilled anc cratered` on 48 features, which 9 further features spell correctly as `infilled and cratered`. Others are `slihgtly elevtated rim`, `realtively unmodified rim`, `hevaily weathered?`, and `minimal degredation`. Some values are sentences about one feature (`slightly elevated but inpacted by smaller crater`, `maybe some to the north?`). None of this can be styled, filtered, faceted, or legended, and AEGIS would show a value like `infilled anc cratered` to a planner verbatim. **Need:** each of the three as a coded value from a documented, closed vocabulary, with the per-feature prose moved to `COMMENT`.
- **`COMMENT`** is the single-space string `" "` on 169 of 199 features. That is the same problem as the literal `"<null>"` in item 3: neither empty nor meaningful, and every consumer has to trim before testing it. Leave it null when there is no comment. The 30 real comments are genuinely useful, but several read as open review actions rather than delivered results — `unsure if is crater, needs verification`, `could be stage 2, needs confirmation`, `tentative suggestion for 4` — which suggests this dataset was exported mid-review. **Need:** confirmation that it is final, or a redelivery once the flagged features are resolved.
- **`FID`**, **`OBJECTID`**, and **`SHAPE_Leng`** are export artifacts. As with boulders, there is no stable per-feature id that survives redelivery. **Need:** a stable `id`, as the nomenclature dataset already supplies.
- **Need:** an expansion of `AM-072736` in the dataset name, or a rename. Same ask as `bwd` in item 9.

### 11. Craters and boulders need one compounded, human-readable label defined by the GIS team

Items 8 and 10 are the same gap in two datasets: neither carries a label, and in both the only text-bearing field is a class name that is identical (boulders) or near-identical (craters, two values across 199 features) on every feature. The fix is not to pick a different existing field — none of them is a label, and the free-text fields in item 10 are too long, too inconsistent, and too often misspelled to put on a map.

**Need: the GIS team defines a standard label vocabulary and delivers a pre-composed label string per feature**, in the single agreed `label` property from item 2. Compose it from a fixed, documented set of terms, in a fixed order, spelled the same way every time:

```text
<feature class> <stable id> - <primary discriminator> (<qualifier>)
```

| Dataset  | Source values                                | Delivered `label`                         |
| -------- | -------------------------------------------- | ----------------------------------------- |
| Craters  | `TYPE=crest of crater rim`, degradation 4    | `Crater rim C-014 - fresh (stage 4)`      |
| Craters  | `TYPE=crest of buried crater`, degradation 1 | `Buried crater C-102 - rimless (stage 1)` |
| Boulders | `SIZE=3`, `CONFIDENCE=3`                     | `Boulder B-017 - 3 m (confirmed)`         |

The exact wording is the GIS team's to set; what matters is the discipline behind it:

1. **Closed vocabulary.** Every term comes from a list published with the delivery — one term per coded value, the same term every time, no free text. This is what makes labels comparable across features and across drops.
2. **Composed by the GIS team, delivered as data.** Do not ask AEGIS to build the string. Composing it in the app would put lunar-geology vocabulary and stage semantics into application code, where the GIS team cannot correct them and where every future delivery needs a code change.
3. **Unique and self-explanatory.** The label must identify one feature and be readable without the legend. A stable per-feature id inside it achieves both and gives planners something they can say out loud on a comm loop.
4. **Coded fields stay.** Keep `Degredatio`/`SIZE`/`CONFIDENCE`/`TYPE` alongside the label. AEGIS styles and filters from the codes and displays the label; the two are not substitutes.
5. **Keep it short.** Target roughly 40 characters. It is drawn at the feature on a map, over the linework it describes. `crest of buried crater` repeated 108 times is both too long and not a label.

Craters ship with labels off for MS3 and boulders are omitted entirely; both turn on once this arrives.

### 12. `LinearFeatures` labels the map with internal codes, and colour-codes nothing

`LinearFeatures` has 290 features and three attributes: `OBJECTID`, `TYPE`, and `COMMENT`, which is null on all 290 (drop it or populate it — same ask as item 3). `TYPE` is the only text in the dataset, and its values are `EHT_lineament_type1` (215 features), `EHT_lineament_type2` (70), and `scarp base` (5).

Three separate problems:

1. **The values are not human-readable.** `EHT` is not expanded anywhere in the delivery, and `type1` versus `type2` says nothing about what distinguishes them. A planner who reads `EHT_lineament_type2` on the map learns nothing from it, and neither does anyone outside the authoring team. **Need:** the expansion of `EHT`, a definition of each lineament type, and delivered values written as words — `Lineament, <what type 1 actually is>` — with the underscores and the internal type numbers dropped.
2. **These should not be per-feature map labels at all.** AEGIS defaults vector-sublayer labels on and falls back to `TYPE`, so this layer draws 290 labels holding three distinct strings, 285 of which are one of the two `EHT_...` codes, across a 1.4 km by 1.5 km area. That is unreadable, and it hides the linework it is supposed to describe. A class shared by 215 features belongs in a legend once, not next to each line.
3. **The delivered symbology cannot tell the two lineament types apart either.** In `LinearFeatures.lyrx`, `EHT_lineament_type1` and `EHT_lineament_type2` render identically: the same grey `rgb(78, 78, 78)`, the same 0.85 pt width, the same `[5, 2]` dash. 285 of the 290 features are therefore indistinguishable on the map by anything except the label text — and that text is the meaningless code. So the layer has a class split that costs 290 labels of clutter and delivers no visual information at all.

**Need: colour-code the classes instead of labelling the features.** Give each lineament type its own colour, keep the dash for line character if it is cartographically meaningful, and let the class read off a legend swatch. If the two types do not differ in a way worth colouring differently, merge them into one class and say so.

This is a general rule, not a linear-features exception: a class name is legend content and a label is per-feature content, and only nomenclature currently delivers the latter. It applies the same way to contacts (item 4), geomorphic units, surface features (item 5), and craters. AEGIS-side, `LinearFeatures`, `craters` (two strings over 199 lines), `contacts`, and `surface features` all register with `showLabels: false`, style their classes by colour, and name those classes in a legend. Per-feature labels turn on for a sublayer when the dataset carries a real per-feature label — `nomenclature` today, `craters` and `boulders` once item 11 is delivered. Item 13 is the general ask behind this one.

### 13. Class-based datasets need a standard class property, a documented vocabulary, and a delivered legend

Six of the ten delivered datasets are class-based: every feature belongs to one of a small set of categories, and the category — not any per-feature text — is what a planner reads off the map. Item 2 asks for one standard `label` property for datasets that identify individual features; **this is the same ask for the property that identifies a feature's class.** Three things are needed together, because any one of them alone still leaves the layer unreadable.

**1. One standard class property name, spelled identically in every dataset.** Today it is `Unit` on geomorphic units, `TYPE` on contacts, linear features, surface features, location features, craters, and boulders, and a dead `Type` also sits on the units dataset (item 3), which means one file carries two differently-cased spellings of the same idea and only one of them is populated. AEGIS resolves this with the same hardcoded fallback chain that item 2 describes, with the same fragility. Settle on one name — `TYPE` is the majority spelling and is fine if kept consistent — and use it everywhere, including on the units dataset in place of `Unit`.

**2. A closed, documented vocabulary of class values.** Values should be human-readable words, not internal codes: `EHT_lineament_type1` (item 12) and the unit keys `c`, `ci`, `ce`, `cs`, `SMej`, `Dej`, `Hs`, `Hh` are meaningless outside the authoring team, and nothing in the delivery expands them. Publish the value list per dataset with a one-line definition of each class, and keep the values stable across deliveries so a layer can be compared drop to drop. Keep short codes as a separate field if the geology workflow needs them.

**3. A legend, in the format AEGIS already uses.** This is not a new standard. Every AEGIS raster thematic layer ships one in its `properties.json`, and the GIS team already feeds it: they deliver symbology as a `.lyrx`, the pipeline converts it to a GDAL ramp (`products/lyrx_to_ramp.py`) and emits the legend from that ramp (`properties/write_properties.py`). The shape is a version, a units abbreviation, and an ordered list of `{ color, description }` rows — for example `missionFiles/50/Layers/slope/properties.json`:

```json
"legend": {
  "version": "2",
  "unitsAbbr": "deg",
  "legend": [
    { "color": "rgb(49, 54, 149)", "description": "[0.0, 1.99)" },
    { "color": "rgb(69, 117, 180)", "description": "[2.0, 3.99)" }
  ]
}
```

A class-based vector layer uses the identical structure, with `unitsAbbr` empty and `description` holding the class display name instead of a numeric range. Geomorphic units already supply the colours; the display names are what is missing:

```json
"legend": {
  "version": "2",
  "unitsAbbr": "",
  "legend": [
    { "color": "rgb(255, 255, 115)", "description": "<display name for unit c>" },
    { "color": "rgb(56, 168, 0)", "description": "<display name for unit ci>" }
  ]
}
```

So the ask is narrow: **deliver each class with an explicit colour in the `.lyrx`, plus its display name and a one-line definition.** That is everything needed to emit the legend the GIS team already knows from the raster layers. `GeoContacts_BuildPolygons8` is one `Unit` display-name column short of meeting it today. The rest are not, because class styling is left implicit in the CIM renderer for AEGIS to reverse-engineer, and the results are uneven:

| Dataset           | Class property | Classes | Delivered class styling                                                             |
| ----------------- | -------------- | ------: | ----------------------------------------------------------------------------------- |
| Geomorphic Units  | `Unit`         |       8 | Eight explicit, distinct fill colours — the one dataset that does this properly     |
| Contacts          | `TYPE`         |       3 | All black; distinguished only by dash pattern                                       |
| Linear Features   | `TYPE`         |       3 | Two of three classes are byte-identical in colour, width, and dash (item 12)        |
| Surface Features  | `TYPE`         |       1 | An embedded 1-bit BMP hatch (`CIMPictureFill`) with no colour                       |
| Craters           | `TYPE`         |       2 | Both black; distinguished by dash and an end marker                                 |
| Location Features | `TYPE`         |       4 | Four point markers, all black (dataset is empty — item on `LocationFeatures` above) |

Two consequences:

- **Colour must be the primary discriminator, not dash or fill pattern.** The legend row is a colour swatch and a description — there is no dash, hatch, or marker field, and adding one is not worth it for a handful of classes. A class distinguished only by a dash pattern therefore cannot be represented in the legend at all, and a `CIMPictureFill` hatch has no OpenLayers equivalent to reproduce. Dashes and markers are welcome as secondary cues — they are good geologic cartography — but each class needs its own colour so it can be legended and so it survives the CIM-to-OpenLayers translation.
- **Colours must be assigned explicitly and stay stable.** Every `.lyrx` in this delivery carries a `CIMRandomHSVColorRamp`, ArcGIS's auto-assign ramp. The units dataset overrides it with real per-class colours; the rest effectively do not. A random ramp means a class added or reordered in a future export gets an arbitrary colour that will not match the previous drop, so a planner who learned the map has to relearn it.

If a `.lyrx` cannot carry the display names and definitions, a plain table shipped alongside works equally well — one row per class with dataset, class value, display name, definition, and colour. Either way the point is that the class-to-colour-to-name mapping arrives as data rather than being inferred from CIM symbology. This also answers item 4 (contacts state only mapping confidence) and item 5 (surface features are unlabelled areas): with a legend, a class-only layer is legible without any per-feature text.

Pipeline side, `properties/write_properties.py` builds legends only from numeric GDAL ramps and hardcodes `type: "tile"` with a `tilePattern`. Emitting a class legend for a `type: "vector"` sublayer needs a categorical path through the same writer; the `properties.json` legend format itself does not change.
