export async function getMissions(): Promise<WrappedResponse<Mission[]>> {
  const res = await fetch(`/api/v1/missionAutomerge`);
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<Mission[]> = await res.json();
  return response;
}

export async function getMissionHomepageItems(): Promise<WrappedResponse<MissionHomepageItem[]>> {
  const res = await fetch(`/api/v1/missionHomepageItems`);
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<MissionHomepageItem[]> = await res.json();
  return response;
}

// create a new mission
export async function createMission(
  sourceMission?: Mission
): Promise<WrappedResponse<AutomergeDocListing>> {
  const res = await fetch(`/api/v1/missionAutomerge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sourceMission }),
  });
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    alert(`Error creating mission. Please let the AEGIS developers know. Status ${errorMessage}`);
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<AutomergeDocListing> = await res.json();
  return response;
}

export async function duplicateMission(
  missionId: number,
  onProgress?: (progress: MissionDuplicationProgress) => void
): Promise<WrappedResponse<number>> {
  const res = await fetch(`/api/v1/missionDup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({ missionId }),
  });
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    return { status: "error", message: errorMessage };
  }

  // Support JSON responses from servers running the previous API version.
  if (!res.body || !res.headers.get("content-type")?.includes("application/x-ndjson")) {
    return (await res.json()) as WrappedResponse<number>;
  }

  const decoder = new TextDecoder();
  let buffered = "";
  let response: WrappedResponse<number> | null = null;
  const processLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as MissionDuplicationProgress | WrappedResponse<number>;
    if ("type" in event && event.type === "progress") {
      onProgress?.(event);
    } else if ("status" in event) {
      response = event;
    }
  };

  for await (const chunk of res.body) {
    buffered += decoder.decode(chunk, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    lines.forEach(processLine);
  }
  buffered += decoder.decode();
  processLine(buffered);

  return (
    response ?? {
      status: "error",
      message:
        "Connection ended before duplication was confirmed. Check the mission list before retrying.",
    }
  );
}

export async function deleteMissions(missionIds: number[]): Promise<WrappedResponse<number[]>> {
  const res = await fetch(`/api/v1/missionAutomerge`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ missionIds }),
  });
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    alert(`Error deleting mission. Please let the AEGIS developers know. Status ${errorMessage}`);
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<number[]> = await res.json();
  return response;
}

// Given that this is a raw dump, we want the raw data and don't need to be worried about whether it matches any specific type.
export async function dumpMission(missionId: number): Promise<WrappedResponse<MissionDump>> {
  const res = await fetch(`/api/v1/missionDump?missionId=${missionId}`);
  // Using "any" here because the response is database records that haven't gone through transformation to the AEGIS store types.
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    alert(`Error dumping mission. Please let the AEGIS developers know. Status ${errorMessage}`);
    return { status: "error", message: errorMessage };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: WrappedResponse<any> = await res.json();
  return response;
}
