import { serverLogger } from "utils/logging/serverLogger";
import StreamZip from "node-stream-zip";
import * as fs from "fs";
import { readdir, mkdir, rm, rename, stat, cp, mkdtemp } from "node:fs/promises";
import path from "node:path";

const destRoot = process.env.STATIC_DIR;

export function resolveStaticPath(relativePath: string): string {
  if (!destRoot) throw new Error("STATIC_DIR is not configured");
  const root = path.resolve(destRoot);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Path must stay within STATIC_DIR");
  }
  let segment = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    segment = path.join(segment, part);
    if (fs.lstatSync(segment, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error("File paths cannot traverse symbolic links");
    }
  }
  return resolved;
}

function assertSafeFileName(name: string): void {
  if (!name || name === "." || name === ".." || path.basename(name) !== name) {
    throw new Error("File name must be a single path segment");
  }
}
export function assertMissionFilePath(missionId: number, relativePath: string): string {
  if (!Number.isInteger(missionId) || missionId <= 0 || typeof relativePath !== "string") {
    throw new Error("A mission ID and file path are required");
  }
  const scope = resolveStaticPath(`missionFiles/${missionId}`);
  const resolved = resolveStaticPath(relativePath);
  const relative = path.relative(scope, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("File path must belong to the authorized mission");
  }
  let ancestor = resolved;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (fs.existsSync(scope)) {
    const physicalRelative = path.relative(fs.realpathSync(scope), fs.realpathSync(ancestor));
    if (
      physicalRelative === ".." ||
      physicalRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(physicalRelative)
    ) {
      throw new Error("File path must belong to the authorized mission");
    }
  }
  return resolved;
}

/**
 * File structure for the STATIC_DIR is as follows
 * [missionId]/
 *    Data/
 *    Layers/
 *        [layerName]/
 */

/**
 * Unzips files into a directory. Deletes original file upon completion.
 * @param filename filename of the .zip file
 * @param outputDir directory off of STATIC_DIR that the zip file contents should be extracted to
 * @param subfolder optional subfolder within the outputDir to unzip to. Ex: a UUID folder for layers
 * @returns returns true if successful. False otherwise. Logs messages to console
 */
export async function unzip(
  filename: string,
  outputDir: string,
  subfolder?: string
): Promise<void> {
  const unzipDirectory = resolveStaticPath(subfolder ? path.join(outputDir, subfolder) : outputDir);
  const zipPath = resolveStaticPath(filename);
  let extractionDirectory: string | undefined;
  let zip: StreamZip.StreamZipAsync | undefined;
  try {
    await mkdir(path.dirname(unzipDirectory), { recursive: true });

    //unzip the file. contents will overwrite if they already exist in location
    serverLogger.info({
      logId: "file",
      logValue: `Unzipping with overwrite: ${destRoot}/${filename}`,
    });
    extractionDirectory = await mkdtemp(path.join(path.dirname(unzipDirectory), ".extract-"));
    zip = new StreamZip.async({ file: zipPath });
    const numFiles = await zip.extract(null, extractionDirectory);
    await zip.close();
    zip = undefined;
    const validateDestination = async (source: string, destination: string): Promise<void> => {
      resolveStaticPath(path.relative(destRoot, destination));
      for (const entry of await readdir(source, { withFileTypes: true })) {
        const target = path.join(destination, entry.name);
        resolveStaticPath(path.relative(destRoot, target));
        if (entry.isSymbolicLink()) throw new Error("Archives cannot contain symbolic links");
        if (entry.isDirectory()) await validateDestination(path.join(source, entry.name), target);
      }
    };
    await validateDestination(extractionDirectory, unzipDirectory);
    await cp(extractionDirectory, unzipDirectory, { recursive: true });

    //delete the original file
    await deleteFile(filename);

    serverLogger.info({
      logId: "file",
      logValue: `File unzip success. Extracted ${numFiles} files. Deleted .zip`,
    });
  } catch (e) {
    await deleteFile(filename);
    // rethrow the error after cleanup so the calling function can catch it
    throw e;
  } finally {
    if (zip) await zip.close();
    if (extractionDirectory) await rm(extractionDirectory, { recursive: true, force: true });
  }
}

/** Move a single file to a new location, creating the destination directory if necessary
 * @param filename POSIX string representation of a file within the STATIC_DIR
 * @param destDir child directory of STATIC_DIR
 * @param subfolder optional subfolder within the destDir to move the file to. Ex. a UUID folder for layers
 * @returns returns true if successful. False otherwise. Logs messages to console
 */
export async function moveFile(
  filename: string,
  destDir: string,
  subfolder?: string
): Promise<void> {
  const destination = resolveStaticPath(subfolder ? path.join(destDir, subfolder) : destDir);

  if (!fs.existsSync(destination)) {
    await mkdir(destination, { recursive: true });
  }

  const srcPath = resolveStaticPath(filename);
  const destPath = resolveStaticPath(
    path.join(subfolder ? path.join(destDir, subfolder) : destDir, path.basename(filename))
  );
  if (fs.existsSync(destPath))
    throw new Error("A file with that name already exists in the destination");

  serverLogger.info({ logId: "file", logValue: `Moving: ${srcPath} to ${destPath}` });
  await rename(srcPath, destPath);
}

/**
 * Recursive delete of a file or folder
 * @param path path to file or folder from the root STATIC_DIR folder.
 * @returns true successfully deleted, false otherwise
 */
export async function deleteFile(path: string): Promise<boolean> {
  try {
    const target = resolveStaticPath(path);
    if (fs.existsSync(target)) {
      await rm(target, { recursive: true }); //delete file or folder
      serverLogger.info({ logId: "file", logValue: `File/directory deleted ${target}` });
      return true;
    } else {
      throw new Error(`File/directory does not exist ${target}`);
    }
  } catch (e) {
    serverLogger.warning({ logId: "file", logValue: `Error in deleteFile: ${e}` });
    return false;
  }
}

/**
 * Lists files in the STATIC_DIR folder
 * @param path the path to directory in the root STATIC_DIR to list
 * @returns an array of files/folders. Returns null if error
 */
export async function listFiles(directoryPath: string): Promise<GISfile[]> {
  try {
    const target = resolveStaticPath(directoryPath);
    if (fs.existsSync(target)) {
      const filesAndFolders = await readdir(target, { withFileTypes: true });
      return await Promise.all(
        filesAndFolders
          .filter((entry) => !entry.isSymbolicLink())
          .map(async (fileOrFolder) => {
            let fileCount = 1;
            let size = null;
            if (fileOrFolder.isDirectory()) {
              fileCount = await countFiles(path.join(target, fileOrFolder.name));
              size = await getDirectorySize(path.join(target, fileOrFolder.name));
            } else {
              size = (await stat(path.join(target, fileOrFolder.name))).size;
            }
            const f: GISfile = {
              name: fileOrFolder.name,
              isDir: fileOrFolder.isDirectory(),
              fileCount: fileCount,
              size,
            };
            return f;
          })
      );
    } else {
      throw new Error(`Path does not exist: ${target}`);
    }
  } catch (e) {
    serverLogger.warning({ logId: "file", logValue: `Error in listfiles: ${e}` });
    return null;
  }
}

/**
 * Recursively calculates the total size (in bytes) of all files within a directory.
 *
 * @param directory - Absolute or relative path to the directory.
 * @returns The total size of all files in the directory.
 */
export async function getDirectorySize(directory: string): Promise<number> {
  let totalSize = 0;
  const dirEntries = await readdir(directory, { withFileTypes: true });

  for (const entry of dirEntries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      totalSize += await getDirectorySize(entryPath);
    } else {
      const fileStat = await stat(entryPath);
      totalSize += fileStat.size;
    }
  }

  return totalSize;
}

/**
 * Recursive file count for a directory
 * @param directory
 * @returns number of files
 */
async function countFiles(directory: string): Promise<number> {
  let numFiles = 0;
  const files = await readdir(directory, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      numFiles += await countFiles(`${directory}/${file.name}`);
    } else {
      numFiles++;
    }
  }
  return numFiles;
}

/**
 * Renames a file/directory in the STATIC_DIR folder
 * @param path the path to directory in the root STATIC_DIR
 * @param oldName old file or folder name
 * @param newName new file or folder name
 * @returns true if rename is successful, false otherwise
 */
export async function renameFile(
  directoryPath: string,
  oldName: string,
  newName: string
): Promise<boolean> {
  try {
    assertSafeFileName(oldName);
    assertSafeFileName(newName);
    const directory = resolveStaticPath(directoryPath);
    const sourcePath = path.join(directory, oldName);
    const destinationPath = path.join(directory, newName);
    if (oldName !== newName && fs.existsSync(destinationPath)) {
      throw new Error("A file with that name already exists in the directory");
    }
    await rename(sourcePath, destinationPath);
    serverLogger.info({
      logId: "file",
      logValue: `Path renamed in ${directory} from ${oldName} to ${newName}`,
    });
    return true;
  } catch (e) {
    serverLogger.warning({ logId: "file", logValue: `Error in renameFile: ${e}` });
    return false;
  }
}

// Helper function to recursively copy directory contents
export async function copyDirectoryContents(
  fromMissionId: number,
  toMissionId: number
): Promise<void> {
  const sourcePath = `missionFiles/${fromMissionId}`;
  const targetPath = `missionFiles/${toMissionId}`;
  const fullSourcePath = assertMissionFilePath(fromMissionId, sourcePath);
  const fullTargetPath = assertMissionFilePath(toMissionId, targetPath);
  if (fromMissionId === toMissionId || fs.existsSync(fullTargetPath)) {
    throw new Error("The copied mission asset directory must be new");
  }

  if (!fs.existsSync(fullSourcePath)) {
    serverLogger.info({
      logId: "file",
      logValue: `No assets to copy: ${sourcePath} does not exist`,
    });
    return;
  }

  try {
    await cp(fullSourcePath, fullTargetPath, {
      recursive: true,
      filter: async (source) => {
        const sourceStat = await fs.promises.lstat(source);
        if (sourceStat.isSymbolicLink())
          throw new Error("Mission assets cannot contain symbolic links");
        return true;
      },
    });
  } catch (error) {
    await rm(fullTargetPath, { recursive: true, force: true });
    throw error;
  }
}
