# Hawiah Core 🦅

**The Universal, Hybrid Database Driver & ORM**

Hawiah abstracts your database layer, allowing you to write code once and run it anywhere. It seamlessly supports SQL, NoSQL, In-Memory, and File-based storage with a unified API.

---

## ✨ Key Features

*   **Universal API:** `insert`, `get`, `update`, `delete` work identically across all drivers.
*   **Hybrid Schema System (New!):**
    *   **Optional:** You can go fully schema-less (NoSQL style).
    *   **Powerful:** Define a Schema to get validation and structure.
    *   **Hybrid Storage:** On SQL drivers, schemas map to real columns for performance, while keeping a JSON column for flexibility.
*   **Virtual Relationships:** define relationships between *different* databases/drivers without complex joins.
*   **Zero Lock-in:** Switch from JSON files to PostgreSQL in seconds.

---

## 📦 Installation

```bash
npm install @hawiah/core
# Install a driver:
npm install @hawiah/sqlite 
# or @hawiah/postgres, @hawiah/mongo, etc.
```

## 🚀 Quick Start

### 1. Schema-Less (Flexible Mode)
Perfect for prototyping or pure NoSQL usage.

```javascript
const { Hawiah } = require('@hawiah/core');
const { SQLiteDriver } = require('@hawiah/sqlite');

const db = new Hawiah({ 
    driver: new SQLiteDriver('mydb.sqlite') 
});

await db.connect();
await db.insert({ title: 'My Post', views: 100 }); // Just works!
```

### 2. With Schema (Structured Mode)
Get validation and SQL performance where needed.

```javascript
const { Hawiah, Schema, DataTypes } = require('@hawiah/core');
const { PostgreSQLDriver } = require('@hawiah/postgres');

// Define Schema (Optional)
const userSchema = new Schema({
    username: { type: DataTypes.STRING, required: true },
    email:    { type: DataTypes.EMAIL },
    data:     { type: DataTypes.JSON } // Flexible JSON field
});

const db = new Hawiah({
    driver: new PostgreSQLDriver({ /* config */, tableName: 'users' }),
    schema: userSchema
});

// Enforces structure & creates real SQL columns
await db.insert({ username: 'Ali' }); 
```

---

## 📚 Drivers

| Driver | Package | Mode |
| :--- | :--- | :--- |
| **SQLite** | `@hawiah/sqlite` | Hybrid (SQL + JSON) |
| **PostgreSQL**| `@hawiah/postgres`| Hybrid (SQL + JSON) |
| **MySQL** | `@hawiah/mysql` | Hybrid (SQL + JSON) |
| **MongoDB** | `@hawiah/mongo` | Virtual Schema |
| **Firebase** | `@hawiah/firebase`| Virtual Schema |
| **Local** | `@hawiah/local` | JSON/YAML Files |

---

## 📖 Documentation

For full details on the advanced Schema system and Relationships, check out the [Full Guide](https://github.com/Shuruhatik/hawiah-core/blob/main/HAWIAH_GUIDE.md).

---

**License:** MIT