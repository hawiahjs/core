import { IDriver, Query, Data } from './interfaces/IDriver';
import { Schema, SchemaDefinition } from './Schema';
import DataLoader from 'dataloader';

/**
 * Hawiah: A lightweight, schema-less database abstraction layer.
 * Designed to be friendly and easy to use.
 */
export class Hawiah {
  protected driver: IDriver;
  protected isConnected: boolean = false;
  protected relations: Map<string, RelationConfig> = new Map();
  protected loaders: Map<string, DataLoader<any, any>> = new Map();
  protected schema?: Schema;
  public static readonly IGNORE_KEYS = new Set(['collectionName', 'tableName', 'collection', 'table', 'connectionKey']);
  private static readonly driversPool: Map<string, IDriver> = new Map();
  private static readonly connectionPromises: Map<string | IDriver, Promise<void>> = new Map();

  private connectionKey?: string;

  /**
   * Generates a unique fingerprint for a connection setup.
   */
  public static getPoolKey(driver: any, config: any): string {
    let cKey = config.connectionKey;
    if (cKey) return cKey;

    cKey = typeof driver === 'function' ? driver.name : (driver.constructor?.name || 'UnknownDriver');

    // Check if the driver supports table switching
    const driverClass = typeof driver === 'function' ? driver : driver.constructor;
    const supportsTable = typeof driverClass.prototype?.table === 'function' ||
      (typeof driver === 'object' && typeof driver.table === 'function');

    // If driver supports table switching, we use the standard IGNORE_KEYS (ignoring collection names)
    // If NOT, we must include collection names in the key to prevent incorrect driver reuse
    const ignoreKeys = supportsTable
      ? Hawiah.IGNORE_KEYS
      : new Set([...Hawiah.IGNORE_KEYS].filter(k => !['collectionName', 'tableName', 'collection', 'table'].includes(k)));

    for (const key in config) {
      if (!ignoreKeys.has(key)) {
        const val = config[key];
        if (val !== null && typeof val !== 'object') {
          cKey += `|${key}:${val}`;
        } else if (val !== null) {
          cKey += `|${key}:${JSON.stringify(val)}`; // Simplistic optimization
        }
      }
    }
    return cKey;
  }

  /**
   * Creates a new Hawiah instance.
   * @param options - Configuration options
   * @param options.driver - The database driver instance OR Driver Class for auto-pooling
   * @param options.config - Configuration for the driver if passing a Class
   * @param options.schema - Optional schema definition
   */
  constructor(options: {
    driver: IDriver | (new (config: any) => IDriver),
    config?: any,
    schema?: Schema | SchemaDefinition
  }) {
    if (typeof options.driver === 'function') {
      const config = options.config || {};
      const cKey = Hawiah.getPoolKey(options.driver, config);
      this.connectionKey = cKey;

      if (Hawiah.driversPool.has(cKey)) {
        const rootDriver = Hawiah.driversPool.get(cKey)!;
        const tableName = config.collectionName || config.tableName || config.collection || config.table || 'default';
        this.driver = rootDriver.table ? rootDriver.table(tableName) : rootDriver;

        if (this.driver.isConnected && this.driver.isConnected()) {
          this.isConnected = true;
        }
      } else {
        this.driver = new options.driver(config);
        Hawiah.driversPool.set(cKey, this.driver);
      }
    } else {
      this.driver = options.driver as IDriver;
    }

    if (options.schema) {
      this.schema = options.schema instanceof Schema ? options.schema : new Schema(options.schema);

      if (this.driver.setSchema && this.schema) {
        this.driver.setSchema(this.schema);
      }
    }
  }

  /**
   * Connects to the database.
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const poolKey = this.connectionKey || this.driver;
    let connectionPromise = Hawiah.connectionPromises.get(poolKey);

    if (!connectionPromise) {
      if (this.driver.isConnected && this.driver.isConnected()) {
        this.isConnected = true;
        return;
      }

      connectionPromise = (async () => {
        await this.driver.connect();
      })();

      Hawiah.connectionPromises.set(poolKey, connectionPromise);
    }

    await connectionPromise;
    this.isConnected = true;
  }

  /**
   * Disconnects from the database.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }
    await this.driver.disconnect();
    this.isConnected = false;
  }

  /**
   * Adds a new record to the database.
   * @param data - The data to add
   * @returns The added record
   */
  async insert(data: Data): Promise<Data> {
    this.ensureConnected();
    const validated = this.validateData(data);
    return await this.driver.set(validated);
  }

  /**
   * Inserts multiple records into the database.
   * @param dataArray - Array of data to insert
   * @returns Array of inserted records
   */
  async insertMany(dataArray: Data[]): Promise<Data[]> {
    this.ensureConnected();
    const results: Data[] = [];
    for (const data of dataArray) {
      const validated = this.validateData(data);
      const result = await this.driver.set(validated);
      results.push(result);
    }
    return results;
  }

  /**
   * Gets records matching the query.
   * @param query - The filter condition (default: all)
   * @param limit - Optional maximum number of records to return
   * @returns Array of matching records
   */
  async get(query: Query = {}, limit?: number): Promise<Data[]> {
    this.ensureConnected();
    const results = await this.driver.get(query);
    if (limit && limit > 0) {
      return results.slice(0, limit);
    }
    return results;
  }

  /**
   * Gets a single record matching the query.
   * @param query - The filter condition
   * @returns The first matching record or null
   */
  async getOne(query: Query): Promise<Data | null> {
    this.ensureConnected();
    return await this.driver.getOne(query);
  }

  /**
   * Gets all records in the database.
   * @returns Array of all records
   */
  async getAll(): Promise<Data[]> {
    this.ensureConnected();
    return await this.driver.get({});
  }

  /**
   * Gets records matching any of the provided queries.
   * @param queries - Array of filter conditions
   * @returns Combined array of matching records
   */
  async getMany(queries: Query[]): Promise<Data[]> {
    this.ensureConnected();
    const results: Data[] = [];
    for (const query of queries) {
      const data = await this.driver.get(query);
      results.push(...data);
    }
    return results;
  }

  /**
   * Updates records matching the query.
   * @param query - The filter condition
   * @param data - The data to update
   * @returns Number of updated records
   */
  async update(query: Query, data: Data): Promise<number> {
    this.ensureConnected();
    const validated = this.validateData(data, true);
    return await this.driver.update(query, validated);
  }

  /**
   * Updates a single record matching the query.
   * @param query - The filter condition
   * @param data - The data to update
   * @returns True if a record was updated
   */
  async updateOne(query: Query, data: Data): Promise<boolean> {
    this.ensureConnected();
    const validated = this.validateData(data, true);
    const count = await this.driver.update(query, validated);
    return count > 0;
  }

  /**
   * Saves a record (adds if new, updates if exists).
   * @param query - The filter condition to check existence
   * @param data - The data to add or update
   * @returns The saved record
   */
  async save(query: Query, data: Data): Promise<Data> {
    this.ensureConnected();
    const existing = await this.driver.getOne(query);
    if (existing) {
      const validated = this.validateData(data, true);
      await this.driver.update(query, validated);
      return { ...existing, ...validated };
    } else {
      const fullData = { ...query, ...data };
      const validated = this.validateData(fullData);
      return await this.driver.set(validated);
    }
  }

  /**
   * Removes records matching the query.
   * @param query - The filter condition
   * @returns Number of removed records
   */
  async remove(query: Query): Promise<number> {
    this.ensureConnected();
    return await this.driver.delete(query);
  }

  /**
   * Removes a single record matching the query.
   * @param query - The filter condition
   * @returns True if a record was removed
   */
  async removeOne(query: Query): Promise<boolean> {
    this.ensureConnected();
    const count = await this.driver.delete(query);
    return count > 0;
  }

  /**
   * Clears all records from the database.
   * @returns Number of removed records
   */
  async clear(): Promise<number> {
    this.ensureConnected();
    return await this.driver.delete({});
  }

  /**
   * Checks if records exist matching the query.
   * @param query - The filter condition
   * @returns True if exists
   */
  async has(query: Query): Promise<boolean> {
    this.ensureConnected();
    return await this.driver.exists(query);
  }

  /**
   * Counts records matching the query.
   * @param query - The filter condition
   * @returns Count of records
   */
  async count(query: Query = {}): Promise<number> {
    this.ensureConnected();
    return await this.driver.count(query);
  }

  /**
   * Counts records where a field matches a value.
   * @param field - The field name
   * @param value - The value to match
   * @returns Count of records
   */
  async countBy(field: string, value: any): Promise<number> {
    this.ensureConnected();
    const query: Query = { [field]: value };
    return await this.driver.count(query);
  }

  /**
   * Gets a record by its ID.
   * @param id - The record ID to search for
   * @returns The matching record or null if not found
   */
  async getById(id: number | string): Promise<Data | null> {
    this.ensureConnected();
    return await this.driver.getOne({ _id: id });
  }

  /**
   * Updates a record by its ID.
   * @param id - The record ID to update
   * @param data - The data to update
   * @returns True if the record was updated
   */
  async updateById(id: number | string, data: Data): Promise<boolean> {
    this.ensureConnected();
    const count = await this.driver.update({ _id: id }, data);
    return count > 0;
  }

  /**
   * Removes a record by its ID.
   * @param id - The record ID to remove
   * @returns True if the record was removed
   */
  async removeById(id: number | string): Promise<boolean> {
    this.ensureConnected();
    const count = await this.driver.delete({ _id: id });
    return count > 0;
  }

  /**
   * Checks if a record exists by its ID.
   * @param id - The record ID to check
   * @returns True if the record exists
   */
  async hasId(id: number | string): Promise<boolean> {
    this.ensureConnected();
    return await this.driver.exists({ _id: id });
  }

  /**
   * Gets records where a field matches a value.
   * @param field - The field name to match
   * @param value - The value to match
   * @returns Array of matching records
   */
  async getBy(field: string, value: any): Promise<Data[]> {
    this.ensureConnected();
    const query: Query = { [field]: value };
    return await this.driver.get(query);
  }

  /**
   * Checks if a record exists where a field matches a value.
   * @param field - The field name to check
   * @param value - The value to match
   * @returns True if a matching record exists
   */
  async hasBy(field: string, value: any): Promise<boolean> {
    this.ensureConnected();
    const query: Query = { [field]: value };
    return await this.driver.exists(query);
  }

  /**
   * Sorts the results based on a field.
   * @param query - The filter condition
   * @param field - The field to sort by
   * @param direction - 'asc' or 'desc'
   * @returns Sorted array of records
   */
  async sort(query: Query, field: string, direction: 'asc' | 'desc' = 'asc'): Promise<Data[]> {
    this.ensureConnected();
    const results = await this.driver.get(query);
    return results.sort((a, b) => {
      if (a[field] < b[field]) return direction === 'asc' ? -1 : 1;
      if (a[field] > b[field]) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  /**
   * Selects specific fields from the results.
   * @param query - The filter condition
   * @param fields - Array of field names to select
   * @returns Array of records with only selected fields
   */
  async select(query: Query, fields: string[]): Promise<Data[]> {
    this.ensureConnected();
    const results = await this.driver.get(query);
    return results.map(record => {
      const selected: Data = {};
      fields.forEach(field => {
        if (field in record) {
          selected[field] = record[field];
        }
      });
      return selected;
    });
  }

  /**
   * Retrieves unique values for a specific field.
   * @param field - The field to get unique values for
   * @param query - Optional filter condition
   * @returns Array of unique values
   */
  async unique(field: string, query: Query = {}): Promise<any[]> {
    this.ensureConnected();
    const results = await this.driver.get(query);
    const values = results.map(record => record[field]);
    return [...new Set(values)];
  }

  /**
   * Groups records by a specific field.
   * @param field - The field to group by
   * @param query - Optional filter condition
   * @returns Object where keys are group values and values are arrays of records
   */
  async group(field: string, query: Query = {}): Promise<{ [key: string]: Data[] }> {
    this.ensureConnected();
    const results = await this.driver.get(query);
    return results.reduce((groups: { [key: string]: Data[] }, record) => {
      const key = String(record[field]);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(record);
      return groups;
    }, {});
  }

  /**
   * Paginates results.
   * @param query - The filter condition
   * @param page - Page number (1-based)
   * @param pageSize - Records per page
   * @returns Pagination result object
   */
  async paginate(query: Query, page: number = 1, pageSize: number = 10): Promise<{
    data: Data[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    this.ensureConnected();
    const allResults = await this.driver.get(query);
    const total = allResults.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const data = allResults.slice(startIndex, endIndex);

    return {
      data,
      page,
      pageSize,
      total,
      totalPages
    };
  }


  /**
   * Calculates the sum of a numeric field.
   * @param field - The field to sum
   * @param query - Optional filter condition
   * @returns The sum of all values in the field
   */
  async sum(field: string, query: Query = {}): Promise<number> {
    this.ensureConnected();
    const results = await this.driver.get(query);
    return results.reduce((sum, record) => sum + (Number(record[field]) || 0), 0);
  }

  /**
   * Increments a numeric field by a specified amount.
   * @param query - The filter condition to find the record
   * @param field - The field to increment
   * @param amount - The amount to increment by (default: 1)
   * @returns The new value after incrementing
   * @throws Error if record is not found
   */
  async increment(query: Query, field: string, amount: number = 1): Promise<number> {
    this.ensureConnected();
    const record = await this.driver.getOne(query);
    if (!record) {
      throw new Error('Record not found');
    }
    const currentValue = Number(record[field]) || 0;
    const newValue = currentValue + amount;
    await this.update(query, { [field]: newValue });
    return newValue;
  }

  /**
   * Decrements a numeric field by a specified amount.
   * @param query - The filter condition to find the record
   * @param field - The field to decrement
   * @param amount - The amount to decrement by (default: 1)
   * @returns The new value after decrementing
   * @throws Error if record is not found
   */
  async decrement(query: Query, field: string, amount: number = 1): Promise<number> {
    return await this.increment(query, field, -amount);
  }


  /**
   * Pushes a value to the end of an array field.
   * @param query - The filter condition to find records
   * @param field - The array field to push to
   * @param value - The value to push
   * @returns Number of records updated
   */
  async push(query: Query, field: string, value: any): Promise<number> {
    this.ensureConnected();
    const records = await this.driver.get(query);
    let count = 0;
    for (const record of records) {
      if (!Array.isArray(record[field])) {
        record[field] = [];
      }
      record[field].push(value);
      const validated = this.validateData(record, false);
      await this.driver.update(query, validated);
      count++;
    }
    return count;
  }

  /**
   * Removes all occurrences of a value from an array field.
   * @param query - The filter condition to find records
   * @param field - The array field to pull from
   * @param value - The value to remove
   * @returns Number of records updated
   */
  async pull(query: Query, field: string, value: any): Promise<number> {
    this.ensureConnected();
    const records = await this.driver.get(query);
    let count = 0;
    for (const record of records) {
      if (Array.isArray(record[field])) {
        const initialLength = record[field].length;
        record[field] = record[field].filter((item: any) => JSON.stringify(item) !== JSON.stringify(value));
        record[field] = record[field].filter((item: any) => JSON.stringify(item) !== JSON.stringify(value));
        if (record[field].length !== initialLength) {
          const validated = this.validateData(record, false);
          await this.driver.update(query, validated);
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Removes the first element from an array field.
   * @param query - The filter condition to find records
   * @param field - The array field to shift
   * @returns Number of records updated
   */
  async shift(query: Query, field: string): Promise<number> {
    this.ensureConnected();
    const records = await this.driver.get(query);
    let count = 0;
    for (const record of records) {
      if (Array.isArray(record[field]) && record[field].length > 0) {
        record[field].shift();
        const validated = this.validateData(record, false);
        await this.driver.update(query, validated);
        count++;
      }
    }
    return count;
  }

  /**
   * Adds a value to the beginning of an array field.
   * @param query - The filter condition to find records
   * @param field - The array field to unshift to
   * @param value - The value to add
   * @returns Number of records updated
   */
  async unshift(query: Query, field: string, value: any): Promise<number> {
    this.ensureConnected();
    const records = await this.driver.get(query);
    let count = 0;
    for (const record of records) {
      if (!Array.isArray(record[field])) {
        record[field] = [];
      }
      record[field].unshift(value);
      const validated = this.validateData(record, false);
      await this.driver.update(query, validated);
      count++;
    }
    return count;
  }

  /**
   * Removes the last element from an array field.
   * @param query - The filter condition to find records
   * @param field - The array field to pop from
   * @returns Number of records updated
   */
  async pop(query: Query, field: string): Promise<number> {
    this.ensureConnected();
    const records = await this.driver.get(query);
    let count = 0;
    for (const record of records) {
      if (Array.isArray(record[field]) && record[field].length > 0) {
        record[field].pop();
        const validated = this.validateData(record, false);
        await this.driver.update(query, validated);
        count++;
      }
    }
    return count;
  }


  /**
   * Removes a field from matching records.
   * @param query - The filter condition to find records
   * @param field - The field name to remove
   * @returns Number of records updated
   */
  async unset(query: Query, field: string): Promise<number> {
    this.ensureConnected();
    const records = await this.driver.get(query);
    let count = 0;
    for (const record of records) {
      if (field in record) {
        delete record[field];
        const validated = this.validateData(record, false);
        await this.driver.update(query, validated);
        count++;
      }
    }
    return count;
  }

  /**
   * Renames a field in matching records.
   * @param query - The filter condition to find records
   * @param oldField - The current field name
   * @param newField - The new field name
   * @returns Number of records updated
   */
  async rename(query: Query, oldField: string, newField: string): Promise<number> {
    this.ensureConnected();
    const records = await this.driver.get(query);
    let count = 0;
    for (const record of records) {
      if (oldField in record) {
        record[newField] = record[oldField];
        delete record[oldField];
        const validated = this.validateData(record, false);
        await this.driver.update(query, validated);
        count++;
      }
    }
    return count;
  }


  /**
   * Gets the first record in the database.
   * @returns The first record or null if empty
   */
  async first(): Promise<Data | null> {
    this.ensureConnected();
    const results = await this.driver.get({});
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Gets the last record in the database.
   * @returns The last record or null if empty
   */
  async last(): Promise<Data | null> {
    this.ensureConnected();
    const results = await this.driver.get({});
    return results.length > 0 ? results[results.length - 1] : null;
  }

  /**
   * Checks if the database is empty.
   * @returns True if no records exist
   */
  async isEmpty(): Promise<boolean> {
    this.ensureConnected();
    const count = await this.driver.count({});
    return count === 0;
  }

  /**
   * Gets random records from the database.
   * @param sampleSize - Number of random records to return (default: 1)
   * @returns Array of random records
   */
  async random(sampleSize: number = 1): Promise<Data[]> {
    this.ensureConnected();
    const results = await this.driver.get({});
    const shuffled = results.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, sampleSize);
  }

  /**
   * Ensures the database is connected before executing operations.
   * @throws Error if database is not connected
   * @private
   */
  private ensureConnected(): void {
    if (!this.isConnected) {
      throw new Error('Database not connected. Call connect() first.');
    }
  }

  /**
   * Gets the underlying database driver.
   * @returns The database driver instance
   */
  getDriver(): IDriver {
    return this.driver;
  }

  /**
   * Checks if the database connection is active.
   * @returns True if connected
   */
  isActive(): boolean {
    return this.isConnected;
  }


  /**
   * Define a relationship with another Hawiah instance
   * @param name - Relationship name
   * @param target - Target Hawiah instance
   * @param localKey - Local field name
   * @param foreignKey - Foreign field name
   * @param type - Relationship type ('one' or 'many')
   */
  relation(name: string, target: Hawiah, localKey: string, foreignKey: string, type: 'one' | 'many' = 'many'): this {
    this.relations.set(name, { target, localKey, foreignKey, type });
    return this;
  }


  /**
   * Get records with populated relationships
   * @param query - Query filter
   * @param relations - Relationship names to populate
   */
  async getWith(query: Query = {}, ...relations: string[]): Promise<Data[]> {
    this.ensureConnected();
    const records = await this.driver.get(query);

    if (relations.length === 0 || records.length === 0) {
      return records;
    }

    for (const relationName of relations) {
      await this.loadRelation(records, relationName);
    }

    return records;
  }

  /**
   * Get one record with populated relationships
   * @param query - Query filter
   * @param relations - Relationship names to populate
   */
  async getOneWith(query: Query, ...relations: string[]): Promise<Data | null> {
    this.ensureConnected();
    const record = await this.driver.getOne(query);

    if (!record || relations.length === 0) {
      return record;
    }

    for (const relationName of relations) {
      await this.loadRelation([record], relationName);
    }

    return record;
  }

  /**
   * Load a relationship for records using DataLoader batching
   */
  private async loadRelation(records: Data[], relationName: string): Promise<void> {
    const relation = this.relations.get(relationName);
    if (!relation) {
      throw new Error(`Relation "${relationName}" not defined`);
    }

    const { target, localKey, foreignKey, type } = relation;

    let loader = this.loaders.get(relationName);
    if (!loader) {
      loader = new DataLoader(async (keys: readonly any[]) => {
        const allRecords = await target.get({});

        if (type === 'one') {
          const map = new Map<any, Data>();
          allRecords.forEach(record => {
            if (keys.includes(record[foreignKey])) {
              map.set(record[foreignKey], record);
            }
          });
          return keys.map(key => map.get(key) || null);
        } else {
          const map = new Map<any, Data[]>();
          allRecords.forEach(record => {
            if (keys.includes(record[foreignKey])) {
              if (!map.has(record[foreignKey])) {
                map.set(record[foreignKey], []);
              }
              map.get(record[foreignKey])!.push(record);
            }
          });
          return keys.map(key => map.get(key) || []);
        }
      }, { cache: true });

      this.loaders.set(relationName, loader);
    }

    const keys = records.map(r => r[localKey]).filter(k => k != null);
    if (keys.length === 0) return;

    const results = await loader.loadMany(keys);

    let resultIndex = 0;
    records.forEach(record => {
      if (record[localKey] != null) {
        record[relationName] = results[resultIndex];
        resultIndex++;
      } else {
        record[relationName] = type === 'many' ? [] : null;
      }
    });
  }

  /**
   * Clear relationship cache
   */
  clearCache(): void {
    this.loaders.forEach(loader => loader.clearAll());
    this.loaders.clear();
  }

  /**
   * Helper to validate data if schema exists and driver is not SQL.
   */
  private validateData(data: Data, isPartial: boolean = false): Data {
    if (this.schema && this.driver.dbType !== 'sql') {
      return this.schema.validate(data, isPartial);
    }
    return data;
  }
}

interface RelationConfig {
  target: Hawiah;
  localKey: string;
  foreignKey: string;
  type: 'one' | 'many';
}
