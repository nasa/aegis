export function publicManifests(manifest, lock) {
  const publicManifest = structuredClone(manifest);
  const publicLock = structuredClone(lock);
  for (const name of Object.keys(publicManifest.optionalDependencies || {})) {
    if (name.startsWith("@emss/")) delete publicManifest.optionalDependencies[name];
  }
  if (!Object.keys(publicManifest.optionalDependencies || {}).length)
    delete publicManifest.optionalDependencies;
  if (publicManifest.optionalDependencies)
    publicLock.packages[""].optionalDependencies = publicManifest.optionalDependencies;
  else delete publicLock.packages[""].optionalDependencies;
  for (const name of Object.keys(publicLock.packages)) {
    if (/(^|\/)node_modules\/@emss\//.test(name)) delete publicLock.packages[name];
  }
  return { manifest: publicManifest, lock: publicLock };
}
