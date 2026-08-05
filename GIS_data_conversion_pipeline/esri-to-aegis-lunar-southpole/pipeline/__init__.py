"""Pipeline internals for the esri-to-aegis lunar south-pole runner.

``main.py`` stays a thin CLI; the bulk lives here:

  * ``reporting`` — output capture (console + conversion report), subprocess ``run``, banners.
  * ``steps``     — the pipeline step functions, helpers, and the step registry.
  * ``summary``   — the AEGIS admin-input summary.

These are imported as a package from ``main.py`` (whose directory is on ``sys.path``), so
the top-level modules ``config`` / ``aegis_api`` / ``register`` / ``box_publish`` remain
importable from here too.
"""
