// Stub: Manus push notifications removed. Use Resend for email notifications.

export async function sendNotification(_userId: string, _message: string): Promise<void> {
  console.warn("[Notification] Push notifications not configured.");
}

export async function notifyOwner(_input: { title: string; content: string } | string): Promise<boolean> {
  const msg = typeof _input === "string" ? _input : `${_input.title}: ${_input.content}`;
  console.warn("[Notification] notifyOwner stub:", msg);
  return false;
}
