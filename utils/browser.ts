export const isWindows10 = async (): Promise<boolean> => {
  // detect if the user is on windows 10
  // Note: this only runs when called via https. If called with http the navigator object is missing the userAgentData property
  let isWindows10 = false;
  const ua = await navigator?.userAgentData?.getHighEntropyValues(["platformVersion"]);

  if (navigator?.userAgentData?.platform === "Windows") {
    const majorPlatformVersion = parseInt(ua.platformVersion.split(".")[0]);
    if (majorPlatformVersion >= 13) {
      //Windows 11 or later
    } else if (majorPlatformVersion > 0) {
      //Windows 10
      isWindows10 = true;
    } else {
      //Before Windows 10
    }
  } else {
    //Not running on Windows
  }
  return isWindows10;
};
