// Storage interface placeholder for future backing service.
export interface IStorage {
  // Implement concrete storage methods here when needed.
}

export class MemStorage implements IStorage {
  constructor() {}
}

export const storage = new MemStorage();
