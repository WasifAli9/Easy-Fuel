// Storage interface - will be replaced with Supabase client
export interface IStorage {
  // Will be implemented with Supabase
}

export class MemStorage implements IStorage {
  constructor() {}
}

export const storage = new MemStorage();
