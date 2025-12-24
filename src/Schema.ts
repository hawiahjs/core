export type SchemaType =
    | 'string' | 'text' | 'char'
    | 'number' | 'integer' | 'float' | 'bigint'
    | 'boolean'
    | 'date'
    | 'array'
    | 'object' | 'json'
    | 'blob'
    | 'uuid' | 'email' | 'url'
    | 'any';

export const DataTypes = {
    STRING: 'string' as SchemaType,
    TEXT: 'text' as SchemaType,
    CHAR: 'char' as SchemaType,
    NUMBER: 'number' as SchemaType,
    INTEGER: 'integer' as SchemaType,
    FLOAT: 'float' as SchemaType,
    BIGINT: 'bigint' as SchemaType,
    BOOLEAN: 'boolean' as SchemaType,
    DATE: 'date' as SchemaType,
    ARRAY: 'array' as SchemaType,
    OBJECT: 'object' as SchemaType,
    JSON: 'json' as SchemaType,
    BLOB: 'blob' as SchemaType,
    UUID: 'uuid' as SchemaType,
    EMAIL: 'email' as SchemaType,
    URL: 'url' as SchemaType,
    ANY: 'any' as SchemaType,
};

export interface SchemaField {
    type: SchemaType;
    required?: boolean;
    default?: any;
}

export interface SchemaDefinition {
    [key: string]: SchemaField | SchemaType;
}

export class Schema {
    private definition: SchemaDefinition;

    constructor(definition: SchemaDefinition) {
        this.definition = definition;
    }

    /**
     * returns the schema definition
     */
    getDefinition(): SchemaDefinition {
        return this.definition;
    }

    /**
     * Validates and processes the data against the schema.
     * Throws an error if validation fails.
     * Returns the processed data (e.g. including defaults).
     * @param data - The data to validate
     * @param isPartial - If true, ignores "required" checks (useful for updates)
     */
    validate(data: any, isPartial: boolean = false): any {
        const validatedData: any = { ...data };

        for (const key in this.definition) {
            let rule = this.definition[key];

            // Normalize rule if it's just a type string
            if (typeof rule === 'string') {
                rule = { type: rule };
            }

            let value = validatedData[key];

            // specific check for handling "id" vs "_id" could vary, but let's stick to schema keys

            // Apply default if undefined (only if not partial, OR if partial and field is undefined but we want defaults?
            // Usually defaults are for creation. Let's skip defaults on partial update unless specifically needed.
            // For simplicity: skip defaults on partial if value is missing)
            if (!isPartial && value === undefined && rule.default !== undefined) {
                value = rule.default;
                validatedData[key] = value;
            }

            // Check required (only if not partial)
            if (!isPartial && rule.required && (value === undefined || value === null)) {
                throw new Error(`Validation Error: Field "${key}" is required.`);
            }

            // Type check (if value is present)
            if (value !== undefined && value !== null && rule.type !== 'any') {
                if (!this.checkType(value, rule.type)) {
                    throw new Error(`Validation Error: Field "${key}" expected type ${rule.type}.`);
                }
            }
        }

        return validatedData;
    }

    private checkType(value: any, type: SchemaType): boolean {
        switch (type) {
            case 'string':
            case 'text':
            case 'char':
                return typeof value === 'string';

            case 'number':
            case 'float':
                return typeof value === 'number' && !isNaN(value);

            case 'integer':
                return Number.isInteger(value);

            case 'bigint':
                return typeof value === 'bigint';

            case 'boolean':
                return typeof value === 'boolean';

            case 'array':
                return Array.isArray(value);

            case 'object':
            case 'json':
                return typeof value === 'object' && value !== null && !Array.isArray(value);

            case 'date':
                return value instanceof Date || (!isNaN(Date.parse(value)) && typeof value !== 'number');

            case 'blob':
                return typeof Buffer !== 'undefined' ? Buffer.isBuffer(value) : value instanceof Uint8Array;

            case 'uuid':
                return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

            case 'email':
                return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

            case 'url':
                if (typeof value !== 'string') return false;
                try {
                    new URL(value);
                    return true;
                } catch {
                    return false;
                }

            case 'any':
            default:
                return true;
        }
    }
}
