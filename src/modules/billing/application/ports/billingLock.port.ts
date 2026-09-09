export abstract class BillingLock {
  abstract run<T>(key: string, operation: () => Promise<T>): Promise<T>;
}
