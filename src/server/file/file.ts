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
): Promise<void> {
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
  } catch (e) {
    //cleanup
    if (subfolder) {
      if (fs.existsSync(`${destRoot}/${outputDir}/${subfolder}`)) {
        await deleteFile(`${outputDir}/${subfolder}`);
      }
    }
    await deleteFile(filename);
    // rethrow the error after cleanup so the calling function can catch it
    throw e;
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

// Helper function to recursively copy directory contents
export async function copyDirectoryContents(
  fromMissionId: number,
  toMissionId: number
): Promise<void> {
  const staticDir = process.env.STATIC_DIR;
  const sourcePath = `missionFiles/${fromMissionId}`;
  const targetPath = `missionFiles/${toMissionId}`;
  const fullSourcePath = path.join(staticDir, sourcePath);
  const fullTargetPath = path.join(staticDir, targetPath);

  // Create target directory if it doesn't exist
  if (!fs.existsSync(fullTargetPath)) {
    await mkdir(fullTargetPath, { recursive: true });
  }

  // Try to use system-specific commands for better performance
  // All these commands are configured to copy recursively
  try {
    const platform = process.platform;

    if (platform === "win32") {
      // Use robocopy on Windows (more modern than xcopy)
      // /E ensures recursive copying (includes empty subdirectories)
      try {
        await executeCommand("robocopy", [fullSourcePath, fullTargetPath, "/E", "/NFL", "/NDL"], {
          acceptableExitCodes: [0, 1, 2, 3, 4, 5, 6, 7],
        });
        console.log(
          `${new Date()} Directory recursively copied using robocopy from ${sourcePath} to ${targetPath}`
        );
        return;
      } catch (error) {
        // Fallback to xcopy if robocopy fails or is not available
        // /E ensures recursive copying (includes empty subdirectories)
        await executeCommand("xcopy", [fullSourcePath, fullTargetPath, "/E", "/I", "/H", "/Y"]);
        console.log(
          `${new Date()} Directory recursively copied using xcopy from ${sourcePath} to ${targetPath}`
        );
        return;
      }
    } else if (platform === "darwin" || platform === "linux") {
      // Use rsync on Linux/macOS
      // -a (archive) ensures recursive copying with permissions preservation
      await executeCommand("rsync", ["-a", `${fullSourcePath}/`, fullTargetPath]);
      console.log(
        `${new Date()} Directory recursively copied using rsync from ${sourcePath} to ${targetPath}`
      );
      return;
    } else {
      // log an error if the platform is not supported
      console.error(
        `${new Date()} Unsupported platform for directory copy: ${platform}. Please copy manually.`
      );
      return;
    }
  } catch (error) {
    console.error(`${new Date()} System copy command failed: ${error}`);
  }
}

/**
 * Execute a system command with the given arguments
 * @param command The command to execute
 * @param args Array of arguments
 * @param options Optional settings
 * @returns Promise that resolves when command completes
 */
async function executeCommand(
  command: string,
  args: string[],
  options: { acceptableExitCodes?: number[]; cwd?: string } = {}
): Promise<void> {
  const { spawn } = require("child_process");

  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { cwd: options.cwd });

    process.on("error", (err: Error) => {
      reject(new Error(`Failed to execute ${command}: ${err.message}`));
    });

    process.on("close", (code: number) => {
      if (options.acceptableExitCodes && options.acceptableExitCodes.includes(code)) {
        resolve();
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}
