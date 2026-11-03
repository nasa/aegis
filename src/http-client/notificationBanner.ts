/** Fetch the banners to display on a page. Pass null for pages that are not mission pages. */
export async function getActiveNotificationBanners(
  missionId: number | null
): Promise<WrappedResponse<ActiveNotificationBanner[]>> {
  const query = missionId === null ? "" : `?missionId=${encodeURIComponent(missionId)}`;
  const res = await fetch(`/api/v1/notificationBanner/active${query}`, { cache: "no-store" });
  if (res.status !== 200) {
    return { status: "error", message: await readErrorMessage(res) };
  }
  return res.json() as Promise<WrappedResponse<ActiveNotificationBanner[]>>;
}

/** Fetch every banner, including disabled and expired ones (super admin only). */
export async function getAllNotificationBanners(): Promise<WrappedResponse<NotificationBanner[]>> {
  const res = await fetch("/api/v1/notificationBanner");
  if (res.status !== 200) {
    return { status: "error", message: await readErrorMessage(res) };
  }
  return res.json() as Promise<WrappedResponse<NotificationBanner[]>>;
}

/** Create a banner (super admin only). */
export async function createNotificationBanner(
  input: NotificationBannerInput
): Promise<WrappedResponse<NotificationBanner>> {
  const res = await fetch("/api/v1/notificationBanner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status !== 200) {
    return { status: "error", message: await readErrorMessage(res) };
  }
  return res.json() as Promise<WrappedResponse<NotificationBanner>>;
}

/** Replace a banner's editable fields (super admin only). */
export async function updateNotificationBanner(
  id: number,
  input: NotificationBannerInput
): Promise<WrappedResponse<NotificationBanner>> {
  const res = await fetch(`/api/v1/notificationBanner/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status !== 200) {
    return { status: "error", message: await readErrorMessage(res) };
  }
  return res.json() as Promise<WrappedResponse<NotificationBanner>>;
}

/** Delete a banner (super admin only). */
export async function deleteNotificationBanner(id: number): Promise<WrappedResponse<number>> {
  const res = await fetch(`/api/v1/notificationBanner/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (res.status !== 200) {
    return { status: "error", message: await readErrorMessage(res) };
  }
  return res.json() as Promise<WrappedResponse<number>>;
}

async function readErrorMessage(res: Response): Promise<string> {
  let errorMessage = `${res.status} ${res.statusText}`;
  try {
    const errorBody = await res.json();
    if (errorBody?.message) errorMessage = errorBody.message;
  } catch {
    /* response body is not JSON */
  }
  return errorMessage;
}
