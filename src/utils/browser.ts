// detect if the user is on windows 10
export const isWindows10 = async (): Promise<boolean> => {
  //userAgentData is only available when called via https. If called with http the navigator object is missing the userAgentData property
  //This is the preferred method for checking OS, however it is not supported by all browsers yet
  if (navigator?.userAgentData) {
    if (navigator.userAgentData.platform === "Windows") {
      const uad = await navigator.userAgentData.getHighEntropyValues(["platformVersion"]);
      const majorPlatformVersion = parseInt(uad?.platformVersion.split(".")[0]);
      if (majorPlatformVersion >= 13) {
        //Windows 11 or later
        return false;
      } else if (majorPlatformVersion > 0) {
        //Windows 10
        return true;
      } else {
        //Before Windows 10
        return false;
      }
    } else {
      //Not running on Windows
      return false;
    }
  } else {
    //Check the older userAgent property (unreliable)
    //Firefox and Safari do not currently support the userAgentData propery so it will fall into this category
    const ua = navigator?.userAgent;

    //The userAgent property will incorrectly return Windows 10 when on a Windows 11. We will accept this edge case
    if (ua?.includes("Windows NT 10")) {
      return true;
    }
  }
  return false;
};
