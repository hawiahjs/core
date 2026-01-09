# @hawiah/core

**Hawiah** is a lightweight, schema-less database abstraction layer designed for modern applications. It provides a unified API for various databases while handling advanced features like **Connection Pooling**, **Relationship Management**, and **Data Batching** automatically.

## Features

- **Unified Interface**: Use MongoDB, SQLite, Firebase, or SQL with the exact same API.
- **Smart Connection Pooling**: Automatically shares physical connections between instances to maximize performance.
- **Next.js & Serverless Ready**: Built-in support for HMR (Hot Module Replacement) and Server Components.
- **Schema Validation**: Optional, simple, and powerful schema definitions.
- **Zero-Config Relations**: Handle database relationships with ease.

## Installation

```bash
npm install @hawiah/core
```

Then install the driver of your choice:

```bash
npm install @hawiah/mongo
# OR
npm install @hawiah/sqlite
# OR
npm install @hawiah/firebase
```

## Usage Examples

Hawiah automatically manages connections. You can create as many instances as you need; if they share the same configuration, they will share the same physical connection.

### 1. MongoDB

```javascript
import { Hawiah } from '@hawiah/core';
import { MongoDriver } from '@hawiah/mongo';

const db = new Hawiah({
  driver: MongoDriver,
  config: { 
    uri: 'mongodb://localhost:27017', 
    dbName: 'my_project',
    collectionName: 'users' // <--- Collection 1
  }
});

const posts = new Hawiah({
  driver: MongoDriver,
  config: { 
    uri: 'mongodb://localhost:27017', 
    dbName: 'my_project',
    collectionName: 'posts' // <--- Collection 2 (Shares connection with users)
  }
});

await db.connect(); // Orchestrates the connection for all sharing instances
```

### 2. SQLite

```javascript
import { Hawiah } from '@hawiah/core';
import { SqliteDriver } from '@hawiah/sqlite';

const users = new Hawiah({
  driver: SqliteDriver,
  config: { 
    filename: './database.sqlite', // <--- Physical File
    table: 'users'
  }
});

const logs = new Hawiah({
  driver: SqliteDriver,
  config: { 
    filename: './database.sqlite', // <--- Same Config = Same Connection
    table: 'logs'
  }
});
```

### 3. Firebase (Firestore)

```javascript
import { Hawiah } from '@hawiah/core';
import { FirebaseDriver } from '@hawiah/firebase';

const firebaseConfig = {
  apiKey: "AIzaSy...",
  projectId: "my-app",
  // ...
};

const profiles = new Hawiah({
  driver: FirebaseDriver,
  config: { 
    firebaseConfig: firebaseConfig,
    collectionName: 'profiles'
  }
});
```

## Next.js 16+ Support

If you are using **Next.js**, use the `HawiahNext` class. It ensures that your database connections persist across Hot Module Reloads (HMR) to prevent "Too Many Connections" errors during development.

```typescript
// lib/db.ts
import { HawiahNext } from '@hawiah/core';
import { MongoDriver } from '@hawiah/mongo';

export const dbEvents = new HawiahNext({
  driver: MongoDriver,
  config: { 
    uri: process.env.MONGO_URI, 
    collectionName: 'events' 
  }
});
```

## License

MIT