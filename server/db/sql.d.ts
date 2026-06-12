/**
 * Minimal ambient type declarations for the sql.js API surface we use.
 *
 * The real `@types/sql.js` package would be a transitive devDep, but for
 * the migration we declare just the methods we touch to keep the type
 * surface small. The full library is untyped.
 */

declare module "sql.js" {
  export interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  export interface Database {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string, params?: unknown[]): QueryExecResult[];
    export(): Uint8Array;
    close(): void;
  }

  export default function initSqlJs(
    config?: Record<string, unknown>
  ): Promise<SqlJsStatic>;
}
