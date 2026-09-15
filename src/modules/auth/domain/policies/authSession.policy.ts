export class AuthSessionPolicy {
  static readonly maxActiveSessions = 10;

  // Active sessions must be ordered from oldest to newest.
  static sessionsToRevoke(active: readonly { id: string }[]): string[] {
    const excess = Math.max(0, active.length + 1 - this.maxActiveSessions);

    return active.slice(0, excess).map((session) => session.id);
  }
}
