import StreamZip from "node-stream-zip";
import * as fs from "fs";
import { readdir, mkdir, rm, rename } from "node:fs/promises";

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
    console.log(`Unzipping with overwrite: ${destRoot}/${filename}`);
    const zip = new StreamZip.async({ file: `${destRoot}/${filename}` });
    const numFiles = await zip.extract(null, unzipDirectory);
    await zip.close();

    //delete the original file
    await deleteFile(filename);

    console.log("File unzip success. Extracted " + numFiles + " files. Deleted .zip");
    return true;
  } catch (e) {
    //cleanup
    if (subfolder) {
      if (fs.existsSync(`${destRoot}/${outputDir}/${subfolder}`)) {
        await deleteFile(`${outputDir}/${subfolder}`);
      }
    }
    await deleteFile(filename);

    console.warn(`Error in unzip. ${e}`);
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
      console.log(`File/directory deleted ${destRoot}/${path}`);
      return true;
    } else {
      throw new Error(`File/directory does not exist ${destRoot}/${path}`);
    }
  } catch (e) {
    console.warn(`Error in deleteFile: ${e}`);
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
      const files = await readdir(`${destRoot}/${path}`, { withFileTypes: true });
      return await Promise.all(
        files.map(async (file) => {
          let fileCount = 1;
          if (file.isDirectory()) {
            fileCount = await countFiles(`${path}/${file.name}`);
          }
          const f: GISfile = { name: file.name, isDir: file.isDirectory(), fileCount: fileCount };
          return f;
        })
      );
    } else {
      throw new Error(`Path does not exist: ${destRoot}/${path}`);
    }
  } catch (e) {
    console.warn(`Error in listfiles: ${e}`);
    return null;
  }
}

/**
 * Recursive file count for a directory
 * @param directory
 * @returns number of files
 */
async function countFiles(directory: string): Promise<number> {
  let numFiles = 0;
  const files = await readdir(`${destRoot}/${directory}`, { withFileTypes: true });
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
    console.log(`Path renamed in ${destRoot}/${path} from ${oldName} to ${newName}`);
    return true;
  } catch (e) {
    console.warn(`Error in renameFile: ${e}`);
    return false;
  }
}
