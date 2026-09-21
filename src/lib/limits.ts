/** Product quotas are enforced on the server, including demo traffic. */
export const LIMITS = Object.freeze({
  users: 100,
  workspacesPerUser: 3,
  membersPerWorkspace: 10,
  boardsPerWorkspace: 5,
  columnsPerBoard: 12,
  cardsPerBoard: 200,
  commentsPerCard: 50,
  attachmentsPerCard: 10,
  attachmentBytes: 10 * 1024 * 1024,
  totalAttachmentBytes: 100 * 1024 * 1024,
  eventsPerBoard: 5000,
  socketsPerBoard: 20,
  messagesPerMinute: 60,
  mutationsPerDay: 2000,
  requestBytes: 32 * 1024,
});
