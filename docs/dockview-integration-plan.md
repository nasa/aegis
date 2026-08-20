# Dockview First-MR Integration Plan

## Goal

Replace the regular mission editor's fixed flexbox layout with Dockview while keeping the page visually and behaviorally equivalent to the current AEGIS editor. The initial Dockview layout is fixed: users cannot resize, rearrange, dock, close, or add the main workspace panes yet.

The only intentional UX change is the map visibility menu. Its existing eye button opens a floating Dockview panel over the map; that panel can be dragged, resized, and closed.

## First-MR Scope

- Migrate the normal `/mission/:id` editor workspace: left navigation/content, map, bottom timeline/measure pane, and right detail pane.
- Keep the 40 px header outside Dockview.
- Preserve the current open/close drawers and their Redux state (`leftPanelIsOpen`, `bottomPanelIsOpen`, and `rightPanelIsOpen`). Existing thunks that automatically open panes must continue to work unchanged.
- Preserve the current dimensions as the initial Dockview sizes: 40 px navigation plus 360 px left content, 256 px bottom allocation (including the 250 px timeline), 480 px right content, and the map filling the remainder.
- Leave full-screen mission sections, dashboard layout, minimap, admin pages, and all other routes on their existing layout in this MR.

## Implementation

### 1. Add a minimal AEGIS Dockview shell

- Add `dockview-react` at the same pinned version used by CODA (`7.0.2`) and import `dockview-react/dist/styles/dockview.css` once in the new layout component.
- Add `src/components/interface/dockview/MissionDockviewLayout.tsx` with a small component registry for `left`, `map`, `bottom`, `right`, and `map-menu` panels. Mount it from the non-full-screen branch of `src/pages/mission.tsx`; do not change the page header or full-screen branch.
- Create the fixed tree once in `onReady`: map; left relative to the map; bottom below the resulting left/map area; then right beside the resulting upper/bottom area. Use initial panel sizes matching the values above, set the main layout to `locked`, and disable main-pane drag/drop.
- Add a scoped CSS module with a zero-gap AEGIS theme. Hide Dockview tab bars for the four main groups and style separators/backgrounds to match the existing borders so Dockview adds no visible chrome or spacing.

This should adapt CODA's proven `DockviewReact` component-registry, `onReady`, stylesheet, and scoped-theme pattern from `../coda/src/components/framework/dockview/dockview.tsx` and `dockview.module.css`. Do not port CODA's layout-letter definitions, serialized-layout DSL, custom tabs, pane picker, preset/share-link integration, watermark, or module-global API reference; none are needed for a single fixed layout.

### 2. Preserve the existing pane components and drawer behavior

- Render `NavGutter`, `LeftControlPanel`, `AegisMapEditor`, `BottomControlPanel`, and `RightControlPanel` inside thin Dockview panel adapters. Keep business state and pane selection in their current Redux slices; Dockview owns geometry only.
- Add a small React context local to `MissionDockviewLayout` for the live `DockviewApi`. This gives drawer controls and the map-menu launcher access to the current layout without introducing CODA's application-global API singleton.
- Bridge the three existing open flags to programmatic Dockview group sizing. Open sizes match today's CSS; closed sizes retain only the existing gutter/drawer affordance. Because the layout is locked, users cannot move sashes, but Redux actions and automatic-open thunks can still resize groups through the API.
- Remove only the superseded flex sizing from `mission.module.css` and `side-controls.module.css`. Keep the pane components, drawer visuals, selectors, and actions intact. OpenLayers already has a `ResizeObserver` in `MapProvider`, so the map should update when Dockview changes its container without map-specific resize code.

### 3. Move the editor map menu into a floating panel

- Lift the editor's `MapMenuProvider` above `MissionDockviewLayout` so the map behaviors and floating menu continue to use the same display state and cookie persistence. Keep `FeatureSourcesProvider` around the map panel only.
- Split the current `MapMenu` into a launcher and panel content without rewriting its controls. In editor mode, the existing eye button opens `map-menu` with Dockview's `floating` option; the existing X closes that panel. Start with the menu closed so initial page appearance remains unchanged.
- Give the floating panel a sensible minimum size and initial position matching today's top-left overlay. Use Dockview's titlebar drag handle and resize handles. Clamp dragging to the live map group's `boundingBox`, and update the floating panel's maximum dimensions when the map panel changes size so it remains on the map.
- Keep the dashboard's current hover-controlled map menu behavior unchanged in this MR. Do not persist floating position/size, add a generic “new pane” command, or allow the map menu to dock yet.

## Verification and Acceptance

- Capture the current editor before implementation at representative desktop viewports (for example 1920x1080 and 1440x900). After migration, compare the header, gutters, pane boundaries, map extent, bottom pane, right pane, and open/closed drawer states. Boundaries should match within a few pixels and no Dockview tabs or extra gaps should be visible.
- Add focused Playwright coverage for initial panel geometry, each existing drawer toggle, automatic right/bottom opening, and a nonblank OpenLayers canvas after every resize.
- Extend the existing eyeball-menu tests to open the floating panel, drag it, resize it, close it with X, and reopen it with the eye button. Assert that it remains within the map and that its visibility controls still affect the map.
- Run the existing map workflow tests, `npm run test:all`, and the focused Playwright tests.

The MR is complete when the regular mission editor looks and behaves like the current UI at the tested viewport sizes, the main layout cannot be rearranged by users, and the map menu is the only movable/resizable Dockview panel.

## Deferred Follow-Up

Layout persistence, user-resizable main panes, arbitrary docking, pane creation, custom tabs, dashboard migration, and CODA-style layout presets should be separate iterations informed by feedback from this fixed-layout release.
