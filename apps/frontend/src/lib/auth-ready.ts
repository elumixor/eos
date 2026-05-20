const { promise, resolve } = Promise.withResolvers<void>();

export const authReady = promise;
export const markAuthReady = resolve;
