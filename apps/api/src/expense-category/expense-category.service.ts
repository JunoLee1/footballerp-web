import { ExpenseCategoryRepository } from "./expense-category.repo";
import { AppError } from "../lib/appError";

interface CachedCategory {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

export class ExpenseCategoryService {
  private cache: CachedCategory[] | null = null;
  private byCode = new Map<string, CachedCategory>();
  private byId = new Map<string, CachedCategory>();

  constructor(private repo: ExpenseCategoryRepository) {}

  private async load() {
    if (this.cache) return;
    const rows = await this.repo.listAll();
    this.cache = rows;
    this.byCode = new Map(rows.map((r) => [r.code, r]));
    this.byId = new Map(rows.map((r) => [r.id, r]));
  }

  async listActive(): Promise<CachedCategory[]> {
    await this.load();
    return this.cache!.filter((c) => c.isActive);
  }

  async listAll(): Promise<CachedCategory[]> {
    await this.load();
    return this.cache!;
  }

  async resolveCategoryId(code: string): Promise<string> {
    await this.load();
    const found = this.byCode.get(code);
    if (!found) throw new AppError(400, "UNKNOWN_CATEGORY_CODE");
    return found.id;
  }

  async resolveCategoryCode(id: string): Promise<string> {
    await this.load();
    const found = this.byId.get(id);
    if (!found) throw new AppError(400, "UNKNOWN_CATEGORY_ID");
    return found.code;
  }

  async isValidCode(code: string): Promise<boolean> {
    await this.load();
    return this.byCode.has(code);
  }

  // future admin CRUD hook
  invalidateCache() {
    this.cache = null;
    this.byCode.clear();
    this.byId.clear();
  }
}
