import StreamZip from "node-stream-zip";
import fs, { RmOptions } from "fs";
import { readdir, mkdir, rm, rename } from "node:fs/promises";

const destRoot = process.env.GIS_UPLOAD_DIR;

/**
 * Unzips files into a directory. Deletes original file upon completion.
 * @param filename filename of the .zip file
 * @param outputDir directory the zip file contents should be extracted to
 * @returns returns true if successful. False otherwise. Logs messages to console
 */
export async function unzip(filename: string, outputDir: string): Promise<boolean> {
  try {
    //make directory if it doesn't exist
    if (!fs.existsSync(`${destRoot}/${outputDir}`)) {
      await mkdir(`${destRoot}/${outputDir}`);
    }

    //unzip the file. contents will overwrite if they already exist in location
    console.log(`Unzipping with overwrite: ${destRoot}/${filename}`);
    const zip = new StreamZip.async({ file: `${destRoot}/${filename}` });
    const numFiles = await zip.extract(null, `${destRoot}/${outputDir}`);
    await zip.close();

    //delete the original file
    await deleteFile(filename);

    console.log("File unzip success. Extracted " + numFiles + " files. Deleted .zip");
    return true;
  } catch (e) {
    //cleanup
    if (fs.existsSync(`${destRoot}/${outputDir}`)) {
      deleteFile(outputDir);
    }
    await deleteFile(filename);

    console.log(`Error in unzip. ${e}`);
    return false;
  }
}

/**
 * Recursive delete of a file or directory
 * @param filename file or directory in destRoot folder
 * @returns true successfully deleted, false otherwise
 * TODO Delete doesn't delete until node is stopped?
 */
export async function deleteFile(filename: string): Promise<boolean> {
  try {
    const options: RmOptions = {
      recursive: true,
    };
    await rm(`${destRoot}/${filename}`, options); //delete file or folder
    console.log(`File/directory deleted ${destRoot}/${filename}`);
    return true;
  } catch (e) {
    console.log(`Error in deleteFile: ${e}`);
    return false;
  }
}

/**
 * Lists files in the destRoot folder
 * @returns an array of files/folders. Returns null if error
 */
export async function listFiles(): Promise<GISfile[]> {
  try {
    const files = await readdir(destRoot, { withFileTypes: true });
    return files.map((file) => {
      let f: GISfile = { name: file.name, isDir: file.isDirectory() };
      return f;
    });
  } catch (e) {
    console.log(`Error in listfiles: ${e}`);
    return null;
  }
}

/**
 * Renames a file/directory in the destRoot folder
 * @param oldName old file or folder name
 * @param newName new file or folder name
 * @returns true if rename is sccessful, false otherwise
 */
export async function renameFile(oldName: string, newName: string): Promise<boolean> {
  try {
    await rename(`${destRoot}/${oldName}`, `${destRoot}/${newName}`);
    console.log(`Path renamed in ${destRoot} from ${oldName} to ${newName}`);
    return true;
  } catch (e) {
    console.log(`Error in renameFile: ${e}`);
    return false;
  }
}
