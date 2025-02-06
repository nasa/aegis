import StreamZip from "node-stream-zip";
import * as fs from "fs";
import { readdir, mkdir, rm, rename, stat } from "node:fs/promises";
import path from "node:path";

const destRoot = process.env.STATIC_DIR;
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
): Promise<boolean> {
  const unzipDirectory = subfolder
    ? `${destRoot}/${outputDir}/${subfolder}`
    : `${destRoot}/${outputDir}`;
  try {
    //make directory if it doesn't exist
    if (!fs.existsSync(unzipDirectory)) {
      await mkdir(unzipDirectory, { recursive: true });
    }

    //unzip the file. contents will overwrite if they already exist in location
    console.log(`${new Date()} Unzipping with overwrite: ${destRoot}/${filename}`);
    const zip = new StreamZip.async({ file: `${destRoot}/${filename}` });
    const numFiles = await zip.extract(null, unzipDirectory);
    await zip.close();

    //delete the original file
    await deleteFile(filename);

    console.log(`${new Date()} File unzip success. Extracted ${numFiles} files. Deleted .zip`);
    return true;
  } catch (e) {
    //cleanup
    if (subfolder) {
      if (fs.existsSync(`${destRoot}/${outputDir}/${subfolder}`)) {
        await deleteFile(`${outputDir}/${subfolder}`);
      }
    }
    await deleteFile(filename);

    console.warn(`${new Date()} Error in unzip. ${e}`);
    return false;
  }
}

/**
 * Recursive delete of a file or folder
 * @param path path to file or folder from the root STATIC_DIR folder.
 * @returns true successfully deleted, false otherwise
 */
export async function deleteFile(path: string): Promise<boolean> {
  try {
    if (fs.existsSync(`${destRoot}/${path}`)) {
      await rm(`${destRoot}/${path}`, { recursive: true }); //delete file or folder
      console.log(`${new Date()} File/directory deleted ${destRoot}/${path}`);
      return true;
    } else {
      throw new Error(`File/directory does not exist ${destRoot}/${path}`);
    }
  } catch (e) {
    console.warn(`${new Date()} Error in deleteFile: ${e}`);
    return false;
  }
}

/**
 * Lists files in the STATIC_DIR folder
 * @param path the path to directory in the root STATIC_DIR to list
 * @returns an array of files/folders. Returns null if error
 */
export async function listFiles(path: string): Promise<GISfile[]> {
  try {
    if (fs.existsSync(`${destRoot}/${path}`)) {
      const filesAndFolders = await readdir(`${destRoot}/${path}`, { withFileTypes: true });
      return await Promise.all(
        filesAndFolders.map(async (fileOrFolder) => {
          let fileCount = 1;
          let size = null;
          if (fileOrFolder.isDirectory()) {
            fileCount = await countFiles(`${destRoot}/${path}/${fileOrFolder.name}`);
            size = await getDirectorySize(`${destRoot}/${path}/${fileOrFolder.name}`);
          } else {
            size = (await stat(`${destRoot}/${path}/${fileOrFolder.name}`)).size;
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
      throw new Error(`Path does not exist: ${destRoot}/${path}`);
    }
  } catch (e) {
    console.warn(`${new Date()} Error in listfiles: ${e}`);
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
export async function renameFile(path: string, oldName: string, newName: string): Promise<boolean> {
  try {
    await rename(`${destRoot}/${path}/${oldName}`, `${destRoot}/${path}/${newName}`);
    console.log(`${new Date()} Path renamed in ${destRoot}/${path} from ${oldName} to ${newName}`);
    return true;
  } catch (e) {
    console.warn(`${new Date()} Error in renameFile: ${e}`);
    return false;
  }
}
